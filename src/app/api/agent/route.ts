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

// --- Helper Function to Wrap MCP Tools ---
// --- Helper Function to Wrap MCP Tools ---
function wrapMcpTools(mcpTools: LangChainTool[]): LangChainTool[] {
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
            const result = await mcpTool.call(callInput as any); // Use 'as any'
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
            const result = await mcpTool.call(callInput as any); // Use 'as any'
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
          const callInput = {}; // Force input to be an empty object
          console.log(`[API Route] extract forcing input to:`, callInput);
          try {
            console.log(
              `[API Route] extract calling original mcpTool.call with:`,
              callInput
            );
            const result = await mcpTool.call(callInput as any); // Use 'as any'
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
          const callInput = {}; // Force input to be an empty object
          console.log(`[API Route] screenshot forcing input to:`, callInput);
          try {
            console.log(
              `[API Route] screenshot calling original mcpTool.call with:`,
              callInput
            );
            const result = await mcpTool.call(callInput as any); // Use 'as any'
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
          // Stagehand observe expects {"instruction": "string"}
          type ObserveToolInput = { instruction: string };
          let callInput: ObserveToolInput;

          if (typeof input === "string") {
            callInput = { instruction: input }; // Wrap string into object
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
            const result = await mcpTool.call(callInput as any); // Use 'as any'
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
    // --- NEW: Wrapper for stagehand_act ---
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
          // Stagehand act expects {"action": "string", "variables"?: object}
          type ActToolInput = {
            action: string;
            variables?: Record<string, any>;
          };
          let callInput: ActToolInput;

          if (typeof input === "string") {
            try {
              // Attempt to parse if the agent sent a JSON string for the object
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
                // If it's just a string, assume it's the action and wrap it
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
              // If parsing fails or it's just a simple string, assume it's the action
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
            // Input is already the correct object shape (or close enough)
            callInput = input as ActToolInput;
            console.log(
              `[API Route] act using object input directly:`,
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
              `[API Route] act calling original mcpTool.call with:`,
              callInput
            );
            const result = await mcpTool.call(callInput as any); // Use 'as any'
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
    // --- Return unmodified tools ---
    else {
      console.log(
        `[API Route] Tool ${mcpTool.name} does not have a specific wrapper.`
      );
      return mcpTool; // Return tools without specific wrappers unmodified
    }
  });
}

export async function POST(req: NextRequest) {
  console.log("\n--- [API Route] Start Request ---");
  let mcpClient: MultiServerMCPClient | null = null;

  try {
    const { objective, activeTools } = await req.json();
    console.log("[API Route] Received objective:", objective);
    console.log("[API Route] Active tools:", activeTools);

    // Filter MCP_CONFIG based on active tools
    const filteredConfig: any = {};
    if (activeTools.browser) {
      filteredConfig.stagehand = MCP_CONFIG.stagehand;
    }
    if (activeTools.calculator) {
      filteredConfig.simple_sse_server = MCP_CONFIG.simple_sse_server;
    }

    console.log(
      "[API Route] Using filtered MCP config:",
      JSON.stringify(filteredConfig, null, 2)
    );
    mcpClient = new MultiServerMCPClient(filteredConfig);

    console.log("[API Route] Attempting mcpClient.initializeConnections()...");
    await mcpClient.initializeConnections();
    console.log("[API Route] mcpClient.initializeConnections() completed.");

    console.log("[API Route] Attempting mcpClient.getTools()...");
    // --- Apply Double Assertion Here ---
    const originalMcpTools = mcpClient.getTools() as unknown as LangChainTool[];
    // --- End Assertion ---
    console.log(
      `[API Route] mcpClient.getTools() returned ${originalMcpTools.length} tools.`
    );
    originalMcpTools.forEach((tool) =>
      console.log(`  - Original Tool: ${tool.name}`)
    );

    // Now this call should work without type errors
    const wrappedTools = wrapMcpTools(originalMcpTools);
    console.log(`[API Route] Wrapped tools count: ${wrappedTools.length}`);
    wrappedTools.forEach((tool) =>
      console.log(`  - Wrapped Tool: ${tool.name}`)
    );

    if (wrappedTools.length === 0) {
      console.warn("[API Route] WARNING: No tools loaded or wrapped.");
    }

    // Create model
    console.log("[API Route] Creating LLM model...");
    const model = new ChatAnthropic({
      modelName: "claude-3-7-sonnet-20250219",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
    console.log("[API Route] LLM Model created.");

    // Get prompt
    console.log("[API Route] Pulling prompt from LangChain Hub...");
    const prompt = PromptTemplate.fromTemplate(MODIFIED_REACT_PROMPT_TEMPLATE);
    console.log("[API Route] Prompt pulled.");

    // Create agent - USE WRAPPED TOOLS
    console.log("[API Route] Creating agent with WRAPPED tools...");
    const agent = await createReactAgent({
      llm: model,
      tools: wrappedTools,
      prompt,
    });
    console.log("[API Route] Agent created.");

    // Create executor - USE WRAPPED TOOLS
    console.log("[API Route] Creating agent executor with WRAPPED tools...");
    const agentExecutor = AgentExecutor.fromAgentAndTools({
      agent,
      tools: wrappedTools,
      verbose: true,
    });
    console.log("[API Route] Agent executor created.");

    // Run agent
    console.log("[API Route] Invoking agent executor...");
    const result = await agentExecutor.invoke({ input: objective });
    console.log("[API Route] Agent executor finished.");

    console.log("[API Route] Sending successful response.");
    return NextResponse.json({ result: result.output });
  } catch (error) {
    console.error("[API Route] --- ERROR in POST Handler ---");
    console.error(error);
    console.error("--- End Error ---");
    // Restore the error response arguments for Error 2
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 } // Add status code back
    );
  } finally {
    console.log("[API Route] Entering finally block.");
    if (mcpClient) {
      console.log("[API Route] Attempting mcpClient.close()...");
      try {
        await mcpClient.close();
        console.log("[API Route] MCP Client closed.");
      } catch (closeError) {
        console.error("[API Route] Error closing MCP Client:", closeError);
      }
    }
    console.log("--- [API Route] End Request ---");
  }
}
