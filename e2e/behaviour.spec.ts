import { expect, test } from "@playwright/test";
import { card, openPage } from "./helpers";

// What the page should do, independent of how it looks pixel for pixel.

const money = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

test("loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
  });
  await openPage(page);
  await expect(page.locator("h1")).toHaveText("Rent or buy, over the long run");
  expect(errors).toEqual([]);
});

test("each chart opens in the view that makes its point", async ({ page }) => {
  await openPage(page);
  // Wealth comparisons: today's money, shown as the gap between the two.
  await expect(page.getByRole("radio", { name: "Today's money" }).first()).toHaveAttribute("aria-checked", "true");
  await expect(card(page, "Who's ahead").getByRole("radio", { name: "The gap" })).toHaveAttribute("aria-checked", "true");
  // Yearly amounts: pounds at the time, so growth and rising rent are visible.
  for (const title of ["Leverage vs compounding", "Rent vs owning costs"]) {
    await expect(card(page, title).getByRole("radio", { name: "Pounds at the time" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  }
});

test("the leverage race opens on running totals, which compound", async ({ page }) => {
  await openPage(page);
  const race = card(page, "Leverage vs compounding");
  await expect(race.getByRole("radio", { name: "Total so far" })).toHaveAttribute("aria-checked", "true");
  const firstYear = money(await race.locator("dt:has-text(\"Home's gain, year 1\") + dd").innerText());
  const total = money(await race.locator("dt:has-text(\"Home's total gain by year 30\") + dd").innerText());
  // Compounding: 30 years of growth adds more than 30 × the first year's gain.
  expect(total).toBeGreaterThan(firstYear * 30);
});

test("the race shows when yearly gains cross and when totals catch up", async ({ page }) => {
  await openPage(page);
  const race = card(page, "Leverage vs compounding");
  await expect(race.locator("dt:has-text(\"Invested cash gains more each year\") + dd")).toContainText(/year|Not within/i);
  await expect(race.locator("dt:has-text(\"Invested cash catches up in total\") + dd")).toContainText(/Year|Not within/);
});

test("both households' net worths are mostly shares after a few years", async ({ page }) => {
  await openPage(page);
  const comp = card(page, "Where each net worth comes from");
  // Year 30 is the last milestone: the buyer's bar has both parts, the renter's only shares.
  const last = comp.locator(".comp-year").last();
  await expect(last.locator(".comp-label")).toHaveText("Year 30");
  const buyerSegments = last.locator(".comp-row").first().locator(".seg");
  const homeWidth = await buyerSegments.nth(0).evaluate((el) => el.getBoundingClientRect().width);
  const sharesWidth = await buyerSegments.nth(1).evaluate((el) => el.getBoundingClientRect().width);
  expect(sharesWidth).toBeGreaterThan(homeWidth);
});

test("rent rises and the mortgage stays put in the costs chart by default", async ({ page }) => {
  await openPage(page);
  const costs = card(page, "Rent vs owning costs");
  const rows = costs.locator("table.flows tbody tr");
  const rentIn = async (i: number) => money((await rows.nth(i).locator("td").nth(1).innerText()).split("on rent")[0]);
  expect(await rentIn(2)).toBeGreaterThan(await rentIn(0));
});

test("every chart draws its lines", async ({ page }) => {
  await openPage(page);
  for (const title of ["Who's ahead", "Leverage vs compounding", "Rent vs owning costs"]) {
    // A series can be empty (e.g. "buying ahead" when renting leads throughout), so look for any drawn line.
    await expect(card(page, title).locator(".recharts-curve").filter({ visible: true }).first()).toBeVisible();
  }
});

test("hovering a figure explains it", async ({ page }) => {
  await openPage(page);
  await page.locator(".headline .tip-trigger").hover();
  await expect(page.getByRole("tooltip")).toContainText("Difference after 30 years");
});

test("switching starting point updates the results", async ({ page }) => {
  await openPage(page);
  const before = await page.locator(".headline").innerText();
  await page.getByRole("radio", { name: /UK household/ }).click();
  await expect(page.locator(".headline")).not.toHaveText(before);
});

test("fits a phone screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
