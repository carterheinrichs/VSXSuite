import { test, expect } from "@playwright/test";

test("visualizer thumbnails reflect pending, superseded and failed loading", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    // @ts-expect-error Browser imports use Vite source resolution.
    const { VisualizerHost } = await import("/src/core/VisualizerHost.ts");
    const select = VisualizerHost.prototype.select;
    VisualizerHost.prototype.select = function (id: string) {
      if (id === "human-heart" || id === "aurora") {
        this.modules.find((module: any) => module.id === id)!.prepare = () =>
          new Promise<void>((resolve, reject) => {
            (window as any).finishScene = resolve;
            (window as any).failScene = () =>
              reject(new Error("Test preparation failure"));
          });
      }
      return select.call(this, id);
    };
  });
  const heart = page.locator('[data-scene="human-heart"]');
  const aurora = page.locator('[data-scene="aurora"]');
  await heart.click();
  await expect(heart).toHaveAttribute("aria-busy", "true");
  await expect(heart.locator(".scene-loading")).toBeVisible();
  await page.locator("#scene-search").fill("heart");
  await expect(heart.locator(".scene-loading")).toBeVisible();
  await page.locator("#scene-search").fill("");
  await aurora.click();
  await expect(heart).toHaveAttribute("aria-busy", "false");
  await expect(aurora).toHaveAttribute("aria-busy", "true");
  await page.evaluate(() => (window as any).finishScene());
  await expect(aurora).toHaveAttribute("aria-busy", "false");
  await expect(aurora).toHaveAttribute("aria-pressed", "true");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-busy", "true");
  await page.evaluate(() => (window as any).failScene());
  await expect(heart).toHaveAttribute("aria-busy", "false");
  await expect(heart.locator(".scene-loading")).toBeHidden();
  await expect(aurora).toHaveAttribute("aria-pressed", "true");
});
