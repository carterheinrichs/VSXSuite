import { test, expect } from "@playwright/test";
test("HDR scenes, audio transport, scene selection and resizing work without shader errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/");
  await expect(page.locator("#error")).toBeHidden();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("AUDIO CONNECTED");
  await expect(page.locator("#duration")).toHaveText("0:08");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("PAUSED");
  const seek = page.getByRole("slider", { name: "Song position" });
  await seek.evaluate((element: HTMLInputElement) => {
    element.value = "4";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#elapsed")).toHaveText("0:04");
  // A suspended audio clock must stay put instead of restarting on resume.
  await page.waitForTimeout(350);
  await expect(seek).toHaveValue("4");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => Number(await seek.inputValue()))
    .toBeGreaterThan(4);
  await expect
    .poll(() => page.locator("#meter").getAttribute("style"))
    .not.toContain("scaleX(0)");
  await expect(page.locator("#rack select option")).toHaveText([
    "Neon feedback",
    "Aurora ribbons",
    "Prismatic drift",
    "Xenon blades",
    "Vector lattice",
    "Solar mandala",
    "Hypernova vortex",
    "Nexus spectrum",
    "Tesla plasma web",
    "Laser cathedral",
    "Apex triangles",
    "Magnetic matter",
    "Classic equalizer",
    "Classic oscilloscope",
    "Lissajous scope",
    "Waterfall spectrogram",
    "Classic starfield",
  ]);
  for (const [label, file] of [
    ["Aurora ribbons", "aurora"],
    ["Prismatic drift", "prismatic"],
    ["Xenon blades", "blades"],
    ["Vector lattice", "lattice"],
    ["Solar mandala", "mandala"],
    ["Hypernova vortex", "hypernova"],
    ["Nexus spectrum", "nexus"],
    ["Tesla plasma web", "tesla"],
    ["Laser cathedral", "cathedral"],
    ["Apex triangles", "triangles"],
    ["Classic equalizer", "classic-spectrum"],
    ["Classic oscilloscope", "oscilloscope"],
    ["Lissajous scope", "lissajous"],
    ["Waterfall spectrogram", "waterfall"],
    ["Classic starfield", "starfield"],
  ]) {
    await page.locator("#rack select").selectOption({ label });
    await expect(page.locator("#rack select")).toHaveValue(label);
    await page.screenshot({ path: "test-results/" + file + ".png" });
  }
  await page.locator("#rack select").selectOption({ label: "Magnetic matter" });
  await expect(page.locator("#rack select")).toHaveValue("Magnetic matter");
  await page.screenshot({ path: "test-results/ferrofluid.png" });
  await page.locator("#rack select").selectOption({ label: "Neon feedback" });
  await expect(page.locator("#rack select")).toHaveValue("Neon feedback");
  await page.screenshot({ path: "test-results/neon.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#stage")).toHaveJSProperty("clientWidth", 390);
  await page.screenshot({ path: "test-results/mobile.png" });
  expect(errors).toEqual([]);
});
test("FFT history, normalized metrics, beat gate and buffer identity", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // Exercise the DSP path without a device or permission prompt.
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const engine = new AudioEngine();
    const bytes = engine.bytes,
      history = engine.history,
      frame = engine.frame;
    bytes.fill(220, 0, 512);
    bytes.fill(192, 512);
    let kicks = 0;
    for (let i = 0; i < 120; i++) {
      engine.update(i / 60, 1 / 60);
      if (frame.kick) kicks++;
    }
    const result = {
      same:
        engine.bytes === bytes &&
        engine.history === history &&
        engine.frame === frame,
      rms: frame.rms,
      bass: frame.bass,
      centroid: frame.centroid,
      history: history[512],
      kicks,
    };
    engine.dispose();
    return result;
  });
  expect(result.same).toBe(true);
  expect(result.rms).toBeCloseTo(0.5, 3);
  expect(result.bass).toBeGreaterThan(0.8);
  expect(result.bass).toBeLessThanOrEqual(1);
  expect(result.centroid).toBeCloseTo(0.5, 3);
  expect(result.history).toBe(220);
  expect(result.kicks).toBe(1);
});

test("local WAV playback and invalid drop feedback", async ({ page }) => {
  await page.goto("/");
  const rate = 16000;
  const samples = rate * 10;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i / rate) * Math.PI * 440) * 18000),
      44 + i * 2,
    );
  await page.locator("#file-input").setInputFiles({
    name: "test-tone.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  await expect(page.locator("#source-label")).toHaveText("TEST-TONE.WAV");
  await expect(page.locator("#status")).toHaveText("AUDIO CONNECTED");
  await expect(page.locator("#duration")).toHaveText("0:10");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const seek = page.getByRole("slider", { name: "Song position" });
  await seek.evaluate((element: HTMLInputElement) => {
    element.value = "6";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#elapsed")).toHaveText("0:06");
  await expect(page.locator("#source-label")).toHaveText("TEST-TONE.WAV");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () => Number(await seek.inputValue()))
    .toBeGreaterThan(6);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["hello"], "notes.txt", { type: "text/plain" }));
    window.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator("#error")).toContainText("Choose an audio file");
});

test("HiDPI rendering is bounded and adapts to sustained slow frames", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  // Synthetic slow timestamps exercise adaptation without depending on GPU speed.
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      raf((time) => callback(time * 8));
  });
  await page.goto("/");
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
  expect(
    await page
      .locator("#stage")
      .evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height),
  ).toBeLessThanOrEqual(1280 * 720);
  await expect
    .poll(
      () =>
        page
          .locator("#stage")
          .evaluate(
            (canvas: HTMLCanvasElement) => canvas.width * canvas.height,
          ),
      { timeout: 15000 },
    )
    .toBeLessThan(200000);
  await context.close();
});
