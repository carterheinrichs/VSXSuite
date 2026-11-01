import { test, expect } from "@playwright/test";
for (const revision of [1, 2]) {
  test(`revision ${revision}: library, export and about navigation`, async ({
    page,
  }) => {
    await page.goto(`/?ui=${revision}`);
    await expect(page.locator("[data-scene]")).toHaveCount(21);
    await page.getByRole("searchbox").fill("aurora");
    await expect(page.locator("[data-scene]")).toHaveCount(1);
    await page.locator('[data-scene="aurora"]').click();
    await expect(page.locator("#scene-title")).toHaveText("Aurora ribbons");
    await expect(page.locator('[data-scene="aurora"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("searchbox").fill("no such scene");
    await expect(page.locator("#scene-grid")).toHaveText(
      "No visualizers match your search.",
    );
    await page.getByRole("searchbox").fill("");
    await page.getByRole("button", { name: "Classic", exact: true }).click();
    await expect(page.locator("[data-scene]")).toHaveCount(5);
    await page.locator("#export-open").click();
    await expect(
      page.getByRole("combobox", { name: "Export resolution" }),
    ).toBeVisible();
    await expect(page.locator("#export")).toBeDisabled();
    await page.getByRole("button", { name: "Close export" }).click();
    await page.locator("#about-open").click();
    await expect(
      page.getByRole("heading", { name: "See what you hear." }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to studio" }).click();
    await page.locator("#focus").click();
    await expect(page.locator("#library")).toBeHidden();
    await expect(page.locator("#rack")).toBeHidden();
  });
}
