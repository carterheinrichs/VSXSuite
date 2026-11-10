import { test, expect } from "@playwright/test";

test("SVG heart loads with strict CSP, uses no worker and renders HDR in both orientations", async ({
  page,
}) => {
  let workers = 0;
  page.on("worker", () => workers++);
  await page.route("http://127.0.0.1:5173/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "content-security-policy":
          "script-src 'self'; worker-src 'none'; object-src 'none'",
      },
    });
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite browser imports.
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Vite browser imports.
    const { HumanHeartModule } =
      await import("/src/modules/HumanHeartModule.ts");
    // @ts-expect-error Vite browser imports.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    // @ts-expect-error Vite browser imports.
    const { target } = await import("/src/shaders/shared.ts");
    const renderer = new T.WebGLRenderer();
    const scene = new HumanHeartModule();
    const audio = new AudioEngine();
    scene.init(renderer, 320, 180);
    await scene.prepare(renderer);
    scene.params.intensity = 12;
    const rows = [];
    for (const [w, h] of [
      [320, 180],
      [180, 320],
    ]) {
      scene.resize(w, h);
      scene.update(audio.update(0, 0), 0, 0);
      const output = target(w, h),
        read = target(w, h);
      scene.render(renderer, output, read);
      const pixels = new Uint16Array(w * h * 4);
      renderer.readRenderTargetPixels(output, 0, 0, w, h, pixels);
      let hdr = 0,
        heart = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const red = T.DataUtils.fromHalfFloat(pixels[i]);
        if (red > 1) hdr++;
        if (red > 0.8) heart++;
      }
      rows.push({ hdr, heart });
      output.dispose();
      read.dispose();
    }
    scene.dispose();
    audio.dispose();
    renderer.dispose();
    return rows;
  });
  expect(workers).toBe(0);
  for (const row of result) {
    expect(row.hdr).toBeGreaterThan(100);
    expect(row.heart).toBeGreaterThan(1000);
  }
});
