import { NextRequest, NextResponse } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { MultiServerMCPClient } from "langchainjs-mcp-adapters";
import { AgentExecutor, createReactAgent } from "langchain/agents";
// import { pull } from "langchain/hub";
import { PromptTemplate } from "@langchain/core/prompts";
import { Tool as LangChainTool, DynamicTool } from "@langchain/core/tools"; // Import BaseTool and DynamicTool

// CORRECTED MCP Configuration Structure: Remove the top-level "servers" key
const MCP_CONFIG = {
  // The keys ARE the server names now
  simple_sse_server: {
    url: "http://localhost:3001/sse", // Make sure port is correct
    transport: "sse",
    restart: {
      enabled: true,
      maxAttempts: 3,
      delayMs: 1000,
    },
  },
  stagehand: {
    // Use the port and path configured in Stagehand's index.ts
    url: process.env.STAGEHAND_MCP_URL || "http://localhost:3002/stagehand/sse", // Use env var if available
    transport: "sse", // Use SSE transport
    restart: {
      // Optional: Configure restart behavior
      enabled: true,
      maxAttempts: 5, // More attempts might be needed if the browser session crashes
      delayMs: 2000,
    },
    // Important: Add timeout if Stagehand operations can be long
    requestTimeoutMs: 120000, // e.g., 2 minutes, adjust as needed
  },
  // If you had another server (like stagehand), it would be another key here:
  // stagehand: { url: "...", transport: "...", ... },
};

const MODIFIED_REACT_PROMPT_TEMPLATE = `Answer the following questions as best you can. You have access to the following tools:

{tools}

Use the following format:

Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation sequence can repeat multiple times if needed)

Thought: IMPORTANT: If the previous Observation answers the Question or fulfills the request, you MUST move directly to the Final Answer. Do not repeat the Action if the Observation is sufficient. I now know the final answer.
Final Answer: the final answer to the original input question

Begin!

Question: {input}
Thought:{agent_scratchpad}`;

// Event tracking types and collector
interface ToolEvent {
  tool: string;
  action: string;
  details?: string;
}

class EventCollector {
  private events: ToolEvent[] = [];

  addEvent(event: ToolEvent) {
    this.events.push(event);
  }

  getEvents() {
    return this.events;
  }

  clear() {
    this.events = [];
  }
}

function wrapMcpTools(
  mcpTools: LangChainTool[],
  eventCollector: EventCollector
): LangChainTool[] {
  console.log(
    `[API Route] Starting wrapMcpTools for ${mcpTools.length} tools...`
  );
  return mcpTools.map((mcpTool) => {
    // --- Wrapper for echo_tool ---
    if (mcpTool.name === "echo_tool") {
      console.log("[API Route] Wrapping 'echo_tool'");
      return new DynamicTool({
        name: mcpTool.name,
        description: mcpTool.description,
        func: async (input: unknown): Promise<string> => {
          console.log(
            `[API Route] echo_tool wrapper received input:`,
            input,
            `(type: ${typeof input})`
          );
          type EchoToolInput = { message: string };
          let callInput: EchoToolInput;
          if (typeof input === "string") {
            callInput = { message: input };
            console.log(`[API Route] echo_tool wrapped string to:`, callInput);
          } else if (
            typeof input === "object" &&
            input !== null &&
            "message" in input &&
            typeof (input as any).message === "string"
          ) {
            callInput = input as EchoToolInput;
            console.log(
              `[API Route] echo_tool using object directly:`,
              callInput
            );
          } else {
            const errorMsg = `Tool ${
              mcpTool.name
            } received unexpected input type: ${typeof input}`;
            console.error(`[API Route] ${errorMsg}`, input);
            throw new Error(errorMsg);
          }
          try {
            console.log(
              `[API Route] echo_tool calling original mcpTool.call with:`,
              callInput
            );
            eventCollector.addEvent({
              tool: mcpTool.name,
              action: "Echo message",
              details: callInput.message,
            });
            const result = await mcpTool.call(callInput as any);
            console.log(
              `[API Route] echo_tool original call returned:`,
              result
            );
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (e) {
            console.error(`[API Route] Error in echo_tool original call:`, e);
            return e instanceof Error
              ? `Error: ${e.message}`
              : `Error: ${String(e)}`;
          }
        },
      });
    }
    // --- Wrapper for stagehand_navigate ---
    else if (mcpTool.name === "stagehand_navigate") {
      console.log("[API Route] Wrapping 'stagehand_navigate'");
      return new DynamicTool({
        name: mcpTool.name,
        description: mcpTool.description,
        func: async (input: unknown): Promise<string> => {
          console.log(
            `[API Route] navigate wrapper received input:`,
            input,
            `(type: ${typeof input})`
          );
          type NavigateToolInput = { url: string };
          let callInput: NavigateToolInput;
          if (typeof input === "string") {
            callInput = { url: input };
            console.log(`[API Route] navigate wrapped string to:`, callInput);
          } else if (
            typeof input === "object" &&
            input !== null &&
            "url" in input &&
            typeof (input as any).url === "string"
          ) {
            callInput = input as NavigateToolInput;
            console.log(
              `[API Route] navigate using object directly:`,
              callInput
            );
          } else {
            const errorMsg = `Tool ${
              mcpTool.name
            } received unexpected input type: ${typeof input}`;
            console.error(`[API Route] ${errorMsg}`, input);
            throw new Error(errorMsg);
          }
          try {
            console.log(
              `[API Route] navigate calling original mcpTool.call with:`,
              callInput
            );
            eventCollector.addEvent({
              tool: mcpTool.name,
              action: "Navigate to URL",
              details: callInput.url,
            });
            const result = await mcpTool.call(callInput as any);
            console.log(`[API Route] navigate original call returned:`, result);
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (e) {
            console.error(`[API Route] Error in navigate original call:`, e);
            return e instanceof Error
              ? `Error: ${e.message}`
              : `Error: ${String(e)}`;
          }
        },
      });
    }
    // --- Wrapper for stagehand_extract ---
    else if (mcpTool.name === "stagehand_extract") {
      console.log(
        "[API Route] Wrapping 'stagehand_extract' (Expects {} input)"
      );
      return new DynamicTool({
        name: mcpTool.name,
        description: mcpTool.description,
        func: async (input: unknown): Promise<string> => {
          console.log(
            `[API Route] extract wrapper received input:`,
            input,
            `(type: ${typeof input})`
          );
          const callInput = {};
          console.log(`[API Route] extract forcing input to:`, callInput);
          try {
            console.log(
              `[API Route] extract calling original mcpTool.call with:`,
              callInput
            );
            eventCollector.addEvent({
              tool: mcpTool.name,
              action: "Extract page content",
            });
            const result = await mcpTool.call(callInput as any);
            console.log(`[API Route] extract original call returned:`, result);
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (e) {
            console.error(`[API Route] Error in extract original call:`, e);
            return e instanceof Error
              ? `Error: ${e.message}`
              : `Error: ${String(e)}`;
          }
        },
      });
    }
    // --- Wrapper for screenshot ---
    else if (mcpTool.name === "screenshot") {
      console.log("[API Route] Wrapping 'screenshot' (Expects {} input)");
      return new DynamicTool({
        name: mcpTool.name,
        description: mcpTool.description,
        func: async (input: unknown): Promise<string> => {
          console.log(
            `[API Route] screenshot wrapper received input:`,
            input,
            `(type: ${typeof input})`
          );
          const callInput = {};
          console.log(`[API Route] screenshot forcing input to:`, callInput);
          try {
            console.log(
              `[API Route] screenshot calling original mcpTool.call with:`,
              callInput
            );
            eventCollector.addEvent({
              tool: mcpTool.name,
              action: "Take screenshot",
            });
            const result = await mcpTool.call(callInput as any);
            console.log(
              `[API Route] screenshot original call returned:`,
              result
            );
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (e) {
            console.error(`[API Route] Error in screenshot original call:`, e);
            return e instanceof Error
              ? `Error: ${e.message}`
              : `Error: ${String(e)}`;
          }
        },
      });
    }
    // --- NEW: Wrapper for stagehand_observe ---
    else if (mcpTool.name === "stagehand_observe") {
      console.log("[API Route] Wrapping 'stagehand_observe'");
      return new DynamicTool({
        name: mcpTool.name,
        description: mcpTool.description,
        func: async (input: unknown): Promise<string> => {
          console.log(
            `[API Route] observe wrapper received input:`,
            input,
            `(type: ${typeof input})`
          );
          type ObserveToolInput = { instruction: string };
          let callInput: ObserveToolInput;
          if (typeof input === "string") {
            callInput = { instruction: input };
            console.log(`[API Route] observe wrapped string to:`, callInput);
          } else if (
            typeof input === "object" &&
            input !== null &&
            "instruction" in input &&
            typeof (input as any).instruction === "string"
          ) {
            callInput = input as ObserveToolInput;
            console.log(
              `[API Route] observe using object directly:`,
              callInput
            );
          } else {
            const errorMsg = `Tool ${
              mcpTool.name
            } received unexpected input type: ${typeof input}`;
            console.error(`[API Route] ${errorMsg}`, input);
            throw new Error(errorMsg);
          }
          try {
            console.log(
              `[API Route] observe calling original mcpTool.call with:`,
              callInput
            );
            eventCollector.addEvent({
              tool: mcpTool.name,
              action: "Observe page elements",
              details: callInput.instruction,
            });
            const result = await mcpTool.call(callInput as any);
            console.log(`[API Route] observe original call returned:`, result);
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (e) {
            console.error(`[API Route] Error in observe original call:`, e);
            return e instanceof Error
              ? `Error: ${e.message}`
              : `Error: ${String(e)}`;
          }
        },
      });
    }
    // --- Wrapper for stagehand_act ---
    else if (mcpTool.name === "stagehand_act") {
      console.log("[API Route] Wrapping 'stagehand_act'");
      return new DynamicTool({
        name: mcpTool.name,
        description: mcpTool.description,
        func: async (input: unknown): Promise<string> => {
          console.log(
            `[API Route] act wrapper received input:`,
            input,
            `(type: ${typeof input})`
          );
          type ActToolInput = {
            action: string;
            variables?: Record<string, any>;
          };
          let callInput: ActToolInput;
          if (typeof input === "string") {
            try {
              const parsedInput = JSON.parse(input);
              if (
                typeof parsedInput === "object" &&
                parsedInput !== null &&
                "action" in parsedInput
              ) {
                callInput = parsedInput as ActToolInput;
                console.log(
                  `[API Route] act parsed string input to object:`,
                  callInput
                );
              } else {
                console.warn(
                  `[API Route] act received plain string for ${mcpTool.name}, assuming it's the 'action'. Wrapping.`
                );
                callInput = { action: input };
                console.log(
                  `[API Route] act wrapping plain string input to:`,
                  callInput
                );
              }
            } catch (e) {
              console.warn(
                `[API Route] act received non-JSON string or failed to parse for ${mcpTool.name}, assuming it's the 'action'. Wrapping.`
              );
              callInput = { action: input };
              console.log(
                `[API Route] act wrapping plain string input to:`,
                callInput
              );
            }
          } else if (
            typeof input === "object" &&
            input !== null &&
            "action" in input &&
            typeof (input as any).action === "string"
          ) {
            callInput = input as ActToolInput;
            console.log(`[API Route] act using object directly:`, callInput);
          } else {
            const errorMsg = `Tool ${
              mcpTool.name
            } received unexpected input type: ${typeof input}`;
            console.error(`[API Route] ${errorMsg}`, input);
            throw new Error(errorMsg);
          }
          try {
            console.log(
              `[API Route] act calling original mcpTool.call with:`,
              callInput
            );
            eventCollector.addEvent({
              tool: mcpTool.name,
              action: "Perform action",
              details: callInput.action,
            });
            const result = await mcpTool.call(callInput as any);
            console.log(`[API Route] act original call returned:`, result);
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (e) {
            console.error(`[API Route] Error in act original call:`, e);
            return e instanceof Error
              ? `Error: ${e.message}`
              : `Error: ${String(e)}`;
          }
        },
      });
    }
    // --- Default: Return original tool ---
    else {
      console.log(`[API Route] Using original tool for ${mcpTool.name}`);
      return mcpTool;
    }
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const objective = searchParams.get("objective");
    const activeTools = JSON.parse(searchParams.get("activeTools") || "{}");

    if (!objective) {
      return NextResponse.json(
        { error: "No objective provided" },
        { status: 400 }
      );
    }

    // Set up SSE response headers
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const response = new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });

    // Initialize event collector with streaming capability
    const eventCollector = new EventCollector();
    const originalAddEvent = eventCollector.addEvent;
    eventCollector.addEvent = async function (event: ToolEvent) {
      originalAddEvent.call(this, event);
      // Stream the event immediately
      const eventData = JSON.stringify({
        type: "event",
        data: { ...event, timestamp: Date.now() },
      });
      await writer.write(encoder.encode(`data: ${eventData}\n\n`));
    };

    // Initialize MCP client
    const mcpClient = new MultiServerMCPClient(MCP_CONFIG);
    await mcpClient.initializeConnections();

    // Get tools from MCP client and wrap them
    const mcpTools = (await mcpClient.getTools()) as unknown as LangChainTool[];
    const wrappedTools = wrapMcpTools(mcpTools, eventCollector);

    // Initialize model and agent
    const model = new ChatAnthropic({
      modelName: "claude-3-sonnet-20240229",
      temperature: 0,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = PromptTemplate.fromTemplate(MODIFIED_REACT_PROMPT_TEMPLATE);

    const agent = await createReactAgent({
      llm: model,
      tools: wrappedTools,
      prompt,
    });

    const agentExecutor = new AgentExecutor({
      agent,
      tools: wrappedTools,
    });

    // Run agent and handle completion
    agentExecutor
      .invoke({
        input: objective,
      })
      .then(async (result) => {
        // Send completion event
        const completionData = JSON.stringify({
          type: "completion",
          data: result.output,
        });
        await writer.write(encoder.encode(`data: ${completionData}\n\n`));
        await writer.close();
      })
      .catch(async (error) => {
        // Send error event
        const errorData = JSON.stringify({
          type: "error",
          data: "Failed to process request",
        });
        await writer.write(encoder.encode(`data: ${errorData}\n\n`));
        await writer.close();
      });

    return response;
  } catch (error) {
    console.error("Error in agent route:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
