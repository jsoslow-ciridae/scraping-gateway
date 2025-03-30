import { NextRequest, NextResponse } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { MultiServerMCPClient } from "langchainjs-mcp-adapters";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { pull } from "langchain/hub";
import { PromptTemplate } from "@langchain/core/prompts";

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
  // If you had another server (like stagehand), it would be another key here:
  // stagehand: { url: "...", transport: "...", ... },
};

export async function POST(req: NextRequest) {
  console.log("\n--- [API Route] Start Request ---"); // Mark start
  let mcpClient: MultiServerMCPClient | null = null;

  try {
    const { objective } = await req.json();
    console.log("[API Route] Received objective:", objective);

    // Setup MCP client and tools
    console.log(
      "[API Route] Instantiating MCP Client with config:",
      JSON.stringify(MCP_CONFIG, null, 2)
    );
    mcpClient = new MultiServerMCPClient(MCP_CONFIG);

    console.log("[API Route] Attempting mcpClient.initializeConnections()...");
    await mcpClient.initializeConnections();
    // If you reach here, the connection *attempt* likely didn't immediately throw an error visible here.
    // The connection might still fail async or during tool listing.
    console.log("[API Route] mcpClient.initializeConnections() completed.");

    console.log("[API Route] Attempting mcpClient.getTools()...");
    const mcpTools = mcpClient.getTools();
    // This logs the tools *known* to the adapter, check if they are populated
    console.log(
      `[API Route] mcpClient.getTools() returned ${mcpTools.length} tools.`
    );
    mcpTools.forEach((tool) => console.log(`  - Tool: ${tool.name}`)); // Log names

    if (mcpTools.length === 0) {
      console.warn(
        "[API Route] WARNING: No tools loaded from MCP server(s). Check server logs and connection."
      );
    }

    // Create model
    console.log("[API Route] Creating LLM model...");
    const model = new ChatAnthropic({
      modelName: "claude-3-7-sonnet-20250219",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
    console.log("[API Route] LLM Model created.");

    // Get the prompt from LangChain Hub
    console.log("[API Route] Pulling prompt from LangChain Hub...");
    const prompt = (await pull("hwchase17/react")) as PromptTemplate;
    console.log("[API Route] Prompt pulled.");

    // Create the agent
    console.log("[API Route] Creating agent...");
    const agent = await createReactAgent({
      llm: model,
      tools: mcpTools, // Pass the (potentially empty) tools list
      prompt,
    });
    console.log("[API Route] Agent created.");

    // Create the executor
    console.log("[API Route] Creating agent executor...");
    const agentExecutor = AgentExecutor.fromAgentAndTools({
      agent,
      tools: mcpTools,
      verbose: true, // Keep verbose LangChain logs
    });
    console.log("[API Route] Agent executor created.");

    // Run the agent
    console.log("[API Route] Invoking agent executor...");
    const result = await agentExecutor.invoke({
      input: objective,
    });
    console.log("[API Route] Agent executor finished.");

    console.log("[API Route] Sending successful response.");
    return NextResponse.json({
      result: result.output,
    });
  } catch (error) {
    // Log the specific error during MCP setup or agent run
    console.error("[API Route] --- ERROR in POST Handler ---");
    console.error(error);
    console.error("--- End Error ---");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 }
    );
  } finally {
    console.log("[API Route] Entering finally block.");
    if (mcpClient) {
      console.log("[API Route] Attempting mcpClient.close()...");
      try {
        await mcpClient.close();
        console.log("[API Route] MCP Client connections closed successfully.");
      } catch (closeError) {
        console.error("[API Route] Error closing MCP Client:", closeError);
      }
    }
    console.log("--- [API Route] End Request ---"); // Mark end
  }
}
