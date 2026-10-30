import { test, expect } from "@playwright/test";

test("page styling loads independently of application JavaScript", async ({
  page,
}) => {
  // A cold module load must not expose the browser's unstyled HTML defaults.
  await page.route("**/src/main.ts", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("header")).toHaveCSS("position", "fixed");
  await expect(page.locator("header")).toHaveCSS(
    "background-color",
    "rgb(11, 13, 22)",
  );
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("#drop")).toBeHidden();
});

test("panel scene selection, focus view and keyboard playback stay accessible", async ({
  page,
}) => {
  await page.goto("/");
  const visibleFolders = page.locator(
    "#rack .tp-fldv:not(.tp-v-hidden) > .tp-fldv_b > .tp-fldv_t",
  );
  await expect(visibleFolders).toHaveText([
    "01  VISUAL ENGINE",
    "NEON FEEDBACK",
    "MASTER POLISH",
    "02  AUDIO SOURCE",
  ]);
  const scene = page.locator("#rack select");
  await scene.selectOption({ label: "Aurora ribbons" });
  await expect(scene).toHaveValue("Aurora ribbons");
  await expect(visibleFolders).toHaveText([
    "01  VISUAL ENGINE",
    "AURORA RIBBONS",
    "MASTER POLISH",
    "02  AUDIO SOURCE",
  ]);
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
  await expect(page.locator("#rack select")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /ATMOSPHERES/ })).toHaveCount(
    0,
  );
  await expect(page.locator("header [data-scene], header nav")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Export resolution" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Export frame rate" }),
  ).toBeVisible();
});
