/**
 * 🤘 Welcome to Stagehand!
 *
 * TO RUN THIS PROJECT:
 * ```
 * npm install
 * npm run start
 * ```
 *
 * To edit config, see `stagehand.config.ts`
 *
 */
import { Page, BrowserContext, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import chalk from "chalk";
import dotenv from "dotenv";
import { actWithCache, drawObserveOverlay, clearOverlays } from "./utils.js";

dotenv.config();

export async function main({
  page,
  context,
  stagehand,
}: {
  page: Page; // Playwright Page with act, extract, and observe methods
  context: BrowserContext; // Playwright BrowserContext
  stagehand: Stagehand; // Stagehand instance
}) {
  // Navigate to the page
  await page.goto("https://www.usi.com/");

  const objective = "List all of the open jobs";

  // You can pass a string directly to act
  const observations = await page.observe();
  console.log(observations);

  // Click the careers button
  await page.act("click the careers button");
  await page.waitForTimeout(1000); // Wait a bit for the navigation to complete

  // // You can use observe to plan an action before doing it
  // const results = await page.observe(
  //   "Type 'Tell me in one sentence why I should use Stagehand' into the search box"
  // );
  // await drawObserveOverlay(page, results); // Highlight the search box
  // await page.waitForTimeout(1000);
  // await clearOverlays(page); // Remove the highlight before typing
  // await page.act(results[0]);

  // // You can also use the actWithCache function to speed up future workflows by skipping LLM calls!
  // // Check out the utils.ts file to see how you can cache actions
  // await actWithCache(page, "Click the suggestion to use AI");
  // await page.waitForTimeout(2000);
  // const { text } = await page.extract({
  //   instruction:
  //     "extract the text of the AI suggestion from the search results",
  //   schema: z.object({
  //     text: z.string(),
  //   }),
  //   useTextExtract: false, // Set this to true if you want to extract longer paragraphs
  // });
  // console.log(chalk.green("AI suggestion:"), text);
}
