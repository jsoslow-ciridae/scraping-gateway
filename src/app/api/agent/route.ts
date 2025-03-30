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
function wrapMcpTools(mcpTools: LangChainTool[]): LangChainTool[] {
  return mcpTools.map((mcpTool) => {
    if (mcpTool.name === "echo_tool") {
      console.log("[API Route] Wrapping 'echo_tool' (Wrap Input + Cast Call)");
      return new DynamicTool({
        name: mcpTool.name,
        description: mcpTool.description,
        func: async (input: unknown): Promise<string> => {
          console.log(
            `[API Route] Wrapper func for ${mcpTool.name} received input:`,
            input,
            `(type: ${typeof input})`
          );

          type EchoToolInput = { message: string };
          let callInput: EchoToolInput; // Object tool expects

          if (typeof input === "string") {
            callInput = { message: input }; // Wrap string into object
            console.log(`[API Route] Wrapping string input to:`, callInput);
          } else if (
            typeof input === "object" &&
            input !== null &&
            "message" in input &&
            typeof (input as any).message === "string"
          ) {
            callInput = input as EchoToolInput; // Use object directly
            console.log(`[API Route] Using object input directly:`, callInput);
          } else {
            console.error(
              `[API Route] Unexpected input type for ${
                mcpTool.name
              }: ${typeof input}`,
              input
            );
            throw new Error(
              `Tool ${
                mcpTool.name
              } received unexpected input type: ${typeof input}`
            );
          }

          try {
            // Call original tool, passing the STRUCTURED object, use 'as any'
            // to bypass the restrictive TypeScript signature of .call()
            console.log(
              `[API Route] Calling original mcpTool.call with STRUCTURED input:`,
              callInput
            );
            const result = await mcpTool.call(callInput as any); // <-- Use 'as any' assertion HERE
            console.log(`[API Route] Original MCP tool call returned:`, result);
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (e) {
            console.error(
              `[API Route] Error calling original ${mcpTool.name}:`,
              e
            );
            return e instanceof Error
              ? `Error: ${e.message}`
              : `Error: ${String(e)}`;
          }
        },
      });
    }
    return mcpTool; // Return other tools unmodified
  });
}

export async function POST(req: NextRequest) {
  console.log("\n--- [API Route] Start Request ---");
  let mcpClient: MultiServerMCPClient | null = null;

  try {
    const { objective } = await req.json();
    console.log("[API Route] Received objective:", objective);

    console.log(
      "[API Route] Instantiating MCP Client with config:",
      JSON.stringify(MCP_CONFIG, null, 2)
    );
    mcpClient = new MultiServerMCPClient(MCP_CONFIG);

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
