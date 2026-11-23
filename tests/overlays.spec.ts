import { test, expect } from "@playwright/test";

test("logo and text overlays composite transparently and react deterministically", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Logo overlay", exact: true }).click();
  const upload = page.getByLabel("Upload logo image", { exact: true });
  await upload.setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>',
    ),
  });
  await expect(
    page.getByRole("button", { name: "logo.svg", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove logo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Upload logo image", exact: true }),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Vite module
    const { BrandOverlay } = await import("/src/modules/BrandOverlay.ts");
    // @ts-expect-error Vite module
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const renderer = new T.WebGLRenderer();
    const audio = new AudioEngine();
    const checks: boolean[] = [];
    for (const kind of ["logo", "text"] as const) {
      const layer = new BrandOverlay(kind);
      if (kind === "logo")
        await layer.loadLogo(
          new File(
            [
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>',
            ],
            "logo.svg",
            { type: "image/svg+xml" },
          ),
        );
      layer.params.enabled = true;
      for (const [w, h] of [
        [256, 144],
        [144, 256],
      ]) {
        const input = new T.WebGLRenderTarget(w, h),
          output = input.clone();
        renderer.setRenderTarget(input);
        renderer.setClearColor(0x102030, 1);
        renderer.clear();
        const baseline = new Uint8Array(w * h * 4);
        renderer.readRenderTargetPixels(input, 0, 0, w, h, baseline);
        const capture = () => {
          layer.render(renderer, output, input, audio.frame, 1);
          const pixels = new Uint8Array(w * h * 4);
          renderer.readRenderTargetPixels(output, 0, 0, w, h, pixels);
          return pixels;
        };
        Object.assign(audio.frame, { bass: 0, rms: 0, songTime: 1 });
        const silent = capture();
        Object.assign(audio.frame, { bass: 0.8, rms: 0.7 });
        const loud = capture(),
          repeat = capture();
        checks.push(loud.some((v: number, i: number) => v !== silent[i]));
        checks.push(loud.every((v: number, i: number) => v === repeat[i]));
        checks.push(
          silent[0] === baseline[0] &&
            silent[1] === baseline[1] &&
            silent[2] === baseline[2],
        );
        layer.params.opacity = 0;
        const invisible = capture();
        checks.push(
          invisible.every((v: number, i: number) => v === baseline[i]),
        );
        layer.params.opacity = 1;
        input.dispose();
        output.dispose();
      }
      layer.dispose();
    }
    audio.dispose();
    renderer.dispose();
    return checks;
  });
  expect(result.every(Boolean), JSON.stringify(result)).toBe(true);
});

test("now playing checkbox uses the footer text and preserves custom text", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Text overlay", exact: true }).click();
  const checkbox = page
    .locator(".tp-lblv")
    .filter({ hasText: "Now playing" })
    .locator('input[type="checkbox"]');
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();

  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { BrandOverlay } = await import("/src/modules/BrandOverlay.ts");
    // @ts-expect-error Vite module
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const audio = new AudioEngine();
    const layer = new BrandOverlay("text", () => audio.nowPlayingText);
    layer.params.enabled = true;
    layer.text.text = "Custom title";
    layer.text.nowPlaying = true;
    const idle = layer.displayText;
    const footer = document.querySelector("#source-label")!.textContent;
    await audio.synth();
    const demo = layer.displayText;
    audio.sourceName = "Song - Artist.wav";
    const track = layer.displayText;
    layer.text.nowPlaying = false;
    const custom = layer.displayText;
    layer.text.text = "";
    const emptyCustom = layer.active;
    layer.text.nowPlaying = true;
    const activeNowPlaying = layer.active;
    layer.dispose();
    audio.dispose();
    return { idle, footer, demo, track, custom, emptyCustom, activeNowPlaying };
  });
  expect(result.idle).toBe(result.footer);
  expect(result.demo).toBe("PROCEDURAL / 120 BPM");
  expect(result.track).toBe("SONG - ARTIST.WAV");
  expect(result.custom).toBe("Custom title");
  expect(result.emptyCustom).toBe(false);
  expect(result.activeNowPlaying).toBe(true);
});
