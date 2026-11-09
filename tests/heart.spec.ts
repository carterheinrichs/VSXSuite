import { test, expect } from "@playwright/test";

test("heart valves cycle in silence, rewind reproducibly and support exterior view", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser imports use Vite source resolution.
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser imports use Vite source resolution.
    const { HumanHeartModule } =
      await import("/src/modules/HumanHeartModule.ts");
    // @ts-expect-error Browser imports use Vite source resolution.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const renderer = new T.WebGLRenderer();
    const audio = new AudioEngine();
    const frame = audio.update(0, 0);
    const scene = new HumanHeartModule();
    scene.params.reactivity = 0;
    scene.params.turn = 0;
    scene.init(renderer, 192, 192);
    const target = new T.WebGLRenderTarget(192, 192);
    const read = new T.WebGLRenderTarget(192, 192);
    function capture(time: number) {
      scene.update(frame, time, 1 / 30);
      scene.render(renderer, target, read);
      const pixels = new Uint8Array(192 * 192 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 192, 192, pixels);
      return pixels;
    }
    const closed = capture(0.12 / 1.12);
    const open = capture(0.65 / 1.12);
    const repeated = capture(0.12 / 1.12);
    scene.params.cutaway = false;
    const exterior = capture(0.12 / 1.12);
    scene.params.cutaway = true;
    scene.params.reactivity = 1;
    frame.bpm = 120;
    frame.beatPhase = 0;
    const onBeat = capture(0);
    frame.beatPhase = 0.5;
    const betweenBeats = capture(0);
    let cycle = 0,
      cutaway = 0,
      tempoCycle = 0,
      mismatch = 0;
    for (let i = 0; i < closed.length; i++) {
      if (Math.abs(closed[i] - open[i]) > 8) cycle++;
      if (Math.abs(closed[i] - exterior[i]) > 8) cutaway++;
      if (closed[i] !== repeated[i]) mismatch++;
      if (Math.abs(onBeat[i] - betweenBeats[i]) > 8) tempoCycle++;
    }
    scene.dispose();
    target.dispose();
    read.dispose();
    renderer.dispose();
    return { cycle, cutaway, mismatch, tempoCycle };
  });
  expect(result.cycle).toBeGreaterThan(500);
  expect(result.cutaway).toBeGreaterThan(500);
  expect(result.mismatch).toBe(0);
  expect(result.tempoCycle).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});
