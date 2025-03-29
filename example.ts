import { z } from "zod";
import { Stagehand } from "@browserbasehq/stagehand";
import "dotenv/config";

(async () => {
  // Initialize Stagehand
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    // To use Anthropic, set modelName to "claude-3-5-sonnet-latest"
    modelName: "gpt-4o",
    modelClientOptions: {
      // To use Anthropic, set apiKey to process.env.ANTHROPIC_API_KEY
      apiKey: process.env.OPENAI_API_KEY,
    },
  });
  await stagehand.init();
  const page = stagehand.page;
  await page.goto("https://docs.browserbase.com");

  // Preview an action before taking it
  const suggestions = await page.observe("click 'Stagehand'");

  // Take a suggested action
  await page.act(suggestions[0]);

  // Read the NPM install command
  const { npmInstallCommand } = await page.extract({
    instruction: "The NPM install command",
    schema: z.object({
      npmInstallCommand: z.string(),
    }),
  });
  console.log(npmInstallCommand);

  await stagehand.close();
})().catch((error) => console.error(error.message));
