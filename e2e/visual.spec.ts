import { expect, test } from "@playwright/test";
import { card, openPage } from "./helpers";

// Reference screenshots of each part of the page. A failure means the page looks
// different from e2e/__screenshots__: open the HTML report to see the diff, then
// either fix the page or, if the change is intended, run `npm run test:ui:update`.

const CARDS = [
  ["verdict", ".verdict"],
  ["whos-ahead", "Who's ahead"],
  ["leverage", "Leverage vs compounding"],
  ["costs", "Rent vs owning costs"],
  ["year-one", "The sum most people stop at"],
  ["risk", "One home vs the whole market"],
  ["what-if", "What if the rate or house prices differ?"],
] as const;

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 1360, height: 900 } });

    for (const [name, target] of CARDS) {
      test(name, async ({ page }) => {
        await openPage(page);
        const el = target.startsWith(".") ? page.locator(target) : card(page, target);
        await expect(el).toHaveScreenshot(`${scheme}-${name}.png`);
      });
    }

    test("inputs", async ({ page }) => {
      await openPage(page);
      await expect(page.locator(".inputs")).toHaveScreenshot(`${scheme}-inputs.png`);
    });
  });
}

test.describe("when the lead changes sides", () => {
  test.use({ viewport: { width: 1360, height: 900 } });
  test("gap chart crosses zero", async ({ page }) => {
    await openPage(page);
    await page.getByRole("radio", { name: /UK household/ }).click();
    await expect(card(page, "Who's ahead")).toHaveScreenshot("light-whos-ahead-crossing.png");
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("first screen", async ({ page }) => {
    await openPage(page);
    await expect(page).toHaveScreenshot("phone-first-screen.png");
  });
});

test.describe("your example", () => {
  test.use({ viewport: { width: 1360, height: 900 } });
  test("leverage race totals catch up late", async ({ page }) => {
    await openPage(page);
    await page.getByRole("radio", { name: /Your example/ }).click();
    await expect(card(page, "Leverage vs compounding")).toHaveScreenshot("light-leverage-example.png");
  });
});
