import type { Page } from "@playwright/test";

/** The card whose heading contains `title`. */
export const card = (page: Page, title: string) =>
  page.locator("section", { has: page.locator("h2", { hasText: title }) }).last();

/** Open the page and wait until fonts and charts have settled. */
export async function openPage(page: Page) {
  await page.goto("/");
  await page.locator(".recharts-surface").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}
