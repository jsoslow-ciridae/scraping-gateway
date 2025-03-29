import { NextRequest, NextResponse } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { MultiServerMCPClient } from "langchainjs-mcp-adapters";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { pull } from "langchain/hub";
import { PromptTemplate } from "@langchain/core/prompts";

// Configure MCP servers
const MCP_CONFIG = {
  servers: {
    stagehand: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-browserbase-stagehand"],
      transport: "stdio",
      env: {
        BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
        BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID,
      },
      restart: {
        enabled: true,
        maxAttempts: 3,
        delayMs: 1000,
      },
    },
  },
};

export async function POST(req: NextRequest) {
  let mcpClient: MultiServerMCPClient | null = null;

  try {
    const { objective } = await req.json();

    // Setup MCP client and tools
    mcpClient = new MultiServerMCPClient(MCP_CONFIG);
    await mcpClient.initializeConnections();
    const mcpTools = mcpClient.getTools();

    // Create model
    const model = new ChatAnthropic({
      modelName: "claude-3-7-sonnet-20250219",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Get the prompt from LangChain Hub
    const prompt = (await pull("hwchase17/react")) as PromptTemplate;

    // Create the agent
    const agent = await createReactAgent({
      llm: model,
      tools: mcpTools,
      prompt,
    });

    // Create the executor
    const agentExecutor = AgentExecutor.fromAgentAndTools({
      agent,
      tools: mcpTools,
      verbose: true,
    });

    // Run the agent
    const result = await agentExecutor.invoke({
      input: objective,
    });

    return NextResponse.json({
      result: result.output,
    });
  } catch (error) {
    console.error("Agent error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 }
    );
  } finally {
    // Ensure we always clean up MCP client
    if (mcpClient) {
      await mcpClient.close();
    }
  }
}
