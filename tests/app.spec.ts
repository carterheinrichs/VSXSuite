import { test, expect } from "@playwright/test";

test("scene shortcuts, focus view and keyboard playback stay accessible", async ({
  page,
}) => {
  await page.goto("/");
  const liquid = page.getByRole("button", { name: "Liquid", exact: true });
  await liquid.click();
  await expect(liquid).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#scene-title")).toHaveText("Liquid infinity");
  await page
    .getByRole("button", { name: "Hide controls", exact: true })
    .click();
  await expect(page.locator("#rack")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show controls", exact: true })
    .click();
  await expect(page.locator("#rack")).toBeVisible();
  await page.locator("#stage").click({ position: { x: 10, y: 300 } });
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  const colors = await page
    .locator("#rack select")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { foreground: style.color, background: style.backgroundColor };
    });
  expect(colors.foreground).toBe("rgb(241, 233, 255)");
  expect(colors.background).toBe("rgb(41, 47, 65)");
});
