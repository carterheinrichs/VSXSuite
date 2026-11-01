import { test, expect } from "@playwright/test";
for (const revision of [1, 2]) {
  test(`revision ${revision}: library, export and about navigation`, async ({
    page,
  }) => {
    await page.goto(`/?ui=${revision}`);
    await expect(page.locator("[data-scene]")).toHaveCount(22);
    await expect(page.locator(".scene-caption")).toHaveCount(0);
    const rack = page.locator("#rack");
    const rackHeight = (await rack.boundingBox())!.height;
    await page.getByRole("button", { name: "Minimize control rack" }).click();
    await expect(page.locator("#rack-controls")).toHaveJSProperty(
      "inert",
      true,
    );
    await expect
      .poll(async () => (await rack.boundingBox())!.height)
      .toBeLessThan(80);
    await page.getByRole("button", { name: "Expand control rack" }).click();
    await expect
      .poll(async () => (await rack.boundingBox())!.height)
      .toBeGreaterThan(rackHeight - 2);
    const expanded = await page.locator("#library").boundingBox();
    await page.getByRole("button", { name: "Minimize visualizers" }).click();
    await expect(page.locator("#library-content")).toBeHidden();
    await expect(page.locator("#library-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect
      .poll(async () => (await page.locator("#library").boundingBox())!.height)
      .toBeLessThan(80);
    const collapsed = await page.locator("#library").boundingBox();
    expect(
      Math.abs(
        expanded!.y + expanded!.height - collapsed!.y - collapsed!.height,
      ),
    ).toBeLessThan(2);
    await page.getByRole("button", { name: "Expand visualizers" }).click();
    await expect(page.getByRole("searchbox")).toBeVisible();
    await page.getByRole("searchbox").fill("aurora");
    await expect(page.locator("[data-scene]")).toHaveCount(1);
    await page.locator('[data-scene="aurora"]').click();
    await expect(
      page.locator(".scene-card[aria-pressed=true] strong"),
    ).toHaveText("Aurora ribbons");
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
    await page.getByRole("link", { name: "Back to VSXSuite" }).click();
    await page.locator("#focus").click();
    await expect(page.locator("#library")).toBeHidden();
    await expect(page.locator("#rack")).toBeHidden();
  });
}
