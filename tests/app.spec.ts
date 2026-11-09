import { test, expect } from "@playwright/test";
for (const revision of [1, 2]) {
  test(`revision ${revision}: library, export and about navigation`, async ({
    page,
  }) => {
    await page.goto(`/?ui=${revision}`);
    await expect(page.locator("[data-scene]")).toHaveCount(27);
    await expect(page.locator("#scene-count")).toHaveText("27");
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
    const catalog = page.locator("#catalog");
    const catalogBox = (await catalog.boundingBox())!;
    const expanded = await page.locator("#library").boundingBox();
    expect(catalogBox.y + catalogBox.height).toBeLessThanOrEqual(
      expanded!.y + 2,
    );
    await page.getByRole("button", { name: "Minimize music catalog" }).click();
    await expect(page.locator("#catalog-content")).toHaveJSProperty(
      "inert",
      true,
    );
    await expect(page.locator("#catalog-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect
      .poll(async () => (await catalog.boundingBox())!.height)
      .toBeLessThan(80);
    await page.getByRole("button", { name: "Expand music catalog" }).click();
    await expect(page.locator("#catalog-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
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
    await expect(page.locator("#scene-count")).toHaveText("1");
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
    await expect(page.locator("#scene-count")).toHaveText("0");
    await page.getByRole("searchbox").fill("");
    await page.getByRole("button", { name: "Natural", exact: true }).click();
    await expect(page.locator("[data-scene]")).toHaveCount(3);
    await page.locator('[data-scene="human-heart"]').click();
    await expect(page.locator('[data-scene="human-heart"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('[data-scene="hubble-nebula"] small')).toHaveText(
      "Natural",
    );
    await page
      .getByRole("button", { name: "Atmospheric", exact: true })
      .click();
    await expect(page.locator('[data-scene="hubble-nebula"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Classic", exact: true }).click();
    await expect(page.locator("[data-scene]")).toHaveCount(5);
    await expect(page.locator("#scene-count")).toHaveText("5");
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
    await expect(page.locator("#catalog")).toBeHidden();
    await expect(page.locator("#library")).toBeHidden();
    await expect(page.locator("#rack")).toBeHidden();
  });
}

test("about page displays third-party notices at the bottom", async ({
  page,
}) => {
  await page.goto("/about.html");
  await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/carterheinrichs/VSXSuite",
  );
  const notices = page.locator("#third-party-notices");
  await expect(
    notices.getByRole("heading", { name: "Third-Party Notices" }),
  ).toBeVisible();
  await expect(notices.getByRole("link", { name: "Three.js" })).toBeVisible();
  await expect(notices.getByRole("link", { name: "Tweakpane" })).toBeVisible();
  await expect(notices.getByRole("link", { name: "Mediabunny" })).toBeVisible();
  await expect(
    notices.getByRole("link", { name: "webgl-noise" }),
  ).toBeVisible();
  await expect(notices).toContainText("Bundled Music Tracks");
  await expect(notices).toContainText("Excluded from MIT License");
  await expect(notices).toContainText("MIT License Notice");
  await expect(notices).toContainText("Mozilla Public License 2.0");
});

test("music catalog dynamically lists Name - Author without filetype, shows runtime and plays tracks", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    function makeWavUrl(seconds: number) {
      const rate = 8000;
      const samples = Math.floor(rate * seconds);
      const buffer = new ArrayBuffer(44 + samples * 2);
      const view = new DataView(buffer);
      const writeStr = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++)
          view.setUint8(offset + i, str.charCodeAt(i));
      };
      writeStr(0, "RIFF");
      view.setUint32(4, 36 + samples * 2, true);
      writeStr(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, "data");
      view.setUint32(40, samples * 2, true);
      for (let i = 0; i < samples; i++) {
        view.setInt16(
          44 + i * 2,
          Math.round(Math.sin((i / rate) * Math.PI * 440) * 14000),
          true,
        );
      }
      return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    }
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { updateCatalogFiles } = await import("/src/audio/MusicCatalog.ts");
    updateCatalogFiles({
      "/music/Solar Echoes - Astral Projection.wav": makeWavUrl(7),
      "/music/Midnight Drift - Nova Pulse.mp3": makeWavUrl(12),
    });
  });
  await expect(page.locator("#catalog-count")).toHaveText("2");
  await expect(page.locator(".catalog-track-title")).toHaveText([
    "Midnight Drift - Nova Pulse",
    "Solar Echoes - Astral Projection",
  ]);
  await expect(page.locator(".catalog-track-runtime")).toHaveText([
    "0:12",
    "0:07",
  ]);
  await page.locator(".catalog-track").first().click();
  await expect(page.locator(".catalog-track").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#source-label")).toHaveText(
    "MIDNIGHT DRIFT - NOVA PULSE",
  );
  await expect(page.locator("#status")).toHaveText("AUDIO CONNECTED");
  await expect(page.locator("footer")).toHaveAttribute(
    "data-audio-state",
    "playing",
  );
  await expect(page.locator("#duration")).toHaveText("0:12");
  await expect(page.locator("#stage")).toHaveAttribute(
    "data-host-mode",
    "realtime",
  );
});

test("failed audio load preserves existing playback and active catalog selection", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    function makeWavUrl(seconds: number) {
      const rate = 8000;
      const samples = Math.floor(rate * seconds);
      const buffer = new ArrayBuffer(44 + samples * 2);
      const view = new DataView(buffer);
      const writeStr = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++)
          view.setUint8(offset + i, str.charCodeAt(i));
      };
      writeStr(0, "RIFF");
      view.setUint32(4, 36 + samples * 2, true);
      writeStr(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, "data");
      view.setUint32(40, samples * 2, true);
      return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    }
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { updateCatalogFiles } = await import("/src/audio/MusicCatalog.ts");
    updateCatalogFiles({
      "/music/Good Track - Artist.wav": makeWavUrl(5),
      "/music/Broken Track - Artist.mp3": "/music/does-not-exist-404.mp3",
    });
  });
  // Play the valid track first ("Good Track - Artist" is second alphabetically)
  const tracks = page.locator(".catalog-track");
  await tracks.nth(1).click();
  await expect(tracks.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#status")).toHaveText("AUDIO CONNECTED");
  // Clicking the broken track shows an error but preserves active playback and selection
  await tracks.nth(0).click();
  await expect(page.locator("#error")).toBeVisible();
  await expect(tracks.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(tracks.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#status")).toHaveText("AUDIO CONNECTED");
  await expect(page.locator("#source-label")).toHaveText("GOOD TRACK - ARTIST");
});
