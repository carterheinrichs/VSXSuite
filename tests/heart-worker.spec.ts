import { test, expect } from "@playwright/test";

test("heart worker keeps the UI running through a slow first draw and preserves HDR", async ({
  page,
}) => {
  // Simulate a driver that blocks for 350ms during compilation/first use.
  await page.route("**/heart.worker.ts*", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = "scope.onmessage = async ({ data }) => {";
    expect(source).toContain(marker);
    await route.fulfill({
      response,
      body: source
        .replace(
          "pass.render(renderer, output);",
          'if (!output.scissorTest || output.scissor.z > 32 || output.scissor.w > 32) throw new Error("Unbounded heart GPU submission"); pass.render(renderer, output);',
        )
        .replace(
          "renderer.toneMapping = T.NoToneMapping;",
          'renderer.readRenderTargetPixels = () => { throw new Error("Synchronous heart readback"); }; renderer.toneMapping = T.NoToneMapping;',
        )
        .replace(
          marker,
          marker +
            " const until = performance.now() + 350; while (performance.now() < until) {}",
        ),
    });
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser imports use Vite source resolution.
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser imports use Vite source resolution.
    const { target } = await import("/src/shaders/shared.ts");
    // @ts-expect-error Browser imports use Vite source resolution.
    const { HumanHeartModule } =
      await import("/src/modules/HumanHeartModule.ts");
    // @ts-expect-error Browser imports use Vite source resolution.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const renderer = new T.WebGLRenderer();
    const audio = new AudioEngine();
    const scene = new HumanHeartModule();
    scene.init(renderer, 192, 192);
    scene.params.intensity = 12;
    scene.update(audio.update(0, 0), 0.12 / 1.12, 1 / 30);
    let ticks = 0;
    const interval = setInterval(() => ticks++, 10);
    await scene.prepare(renderer);
    clearInterval(interval);
    const expected = target(192, 192),
      actual = target(192, 192);
    scene.render(renderer, expected, actual);
    scene.renderRealtime(renderer, actual);
    const a = new Uint16Array(192 * 192 * 4),
      b = new Uint16Array(a.length);
    renderer.readRenderTargetPixels(expected, 0, 0, 192, 192, a);
    renderer.readRenderTargetPixels(actual, 0, 0, 192, 192, b);
    let maxError = 0,
      totalError = 0,
      hdr = 0;
    for (let i = 0; i < a.length; i++) {
      const x = T.DataUtils.fromHalfFloat(a[i]),
        y = T.DataUtils.fromHalfFloat(b[i]);
      const error = Math.abs(x - y);
      maxError = Math.max(maxError, error);
      totalError += error;
      if (i % 4 !== 3 && y > 1) hdr++;
    }
    const worker = (scene as any).realtime.worker as Worker;
    const nextFrame = () =>
      new Promise<void>((resolve) =>
        worker.addEventListener("message", () => resolve(), { once: true }),
      );
    // Drain the already requested frame, then change size, valve mode and phase.
    await nextFrame();
    scene.resize(145, 257);
    scene.params.cutaway = false;
    const frame = audio.update(4, 1 / 30);
    frame.beatPhase = 0.5;
    scene.update(frame, 4, 1 / 30);
    expected.setSize(145, 257);
    actual.setSize(145, 257);
    const updated = nextFrame();
    scene.renderRealtime(renderer, actual);
    await updated;
    scene.render(renderer, expected, actual);
    scene.renderRealtime(renderer, actual);
    const c = new Uint16Array(145 * 257 * 4),
      d = new Uint16Array(c.length);
    renderer.readRenderTargetPixels(expected, 0, 0, 145, 257, c);
    renderer.readRenderTargetPixels(actual, 0, 0, 145, 257, d);
    let resizedError = 0;
    for (let i = 0; i < c.length; i++)
      resizedError = Math.max(
        resizedError,
        Math.abs(
          T.DataUtils.fromHalfFloat(c[i]) - T.DataUtils.fromHalfFloat(d[i]),
        ),
      );
    scene.dispose();
    expected.dispose();
    actual.dispose();
    renderer.dispose();
    audio.dispose();
    return {
      ticks,
      maxError,
      meanError: totalError / a.length,
      hdr,
      resizedError,
    };
  });
  expect(result.ticks).toBeGreaterThan(10);
  expect(result.hdr).toBeGreaterThan(100);
  expect(result.maxError).toBeLessThan(0.02);
  expect(result.meanError).toBeLessThan(0.001);
  expect(result.resizedError).toBeLessThan(0.02);
});
