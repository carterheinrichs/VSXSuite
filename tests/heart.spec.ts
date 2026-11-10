import { test, expect } from "@playwright/test";

test("heart valves alternate locally, rewind reproducibly and follow audio phase", async ({
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
    scene.init(renderer, 192, 192);
    await scene.prepare(renderer);
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
    const valveA = (scene as any).extra.uValveOpen.value.toArray();
    const open = capture(0.65 / 1.12);
    const valveB = (scene as any).extra.uValveOpen.value.toArray();
    const repeated = capture(0.12 / 1.12);
    scene.params.reactivity = 1;
    frame.bpm = 120;
    frame.beatPhase = 0;
    const onBeat = capture(0);
    frame.beatPhase = 0.5;
    const betweenBeats = capture(0);
    let cycle = 0,
      tempoCycle = 0,
      mismatch = 0,
      vesselMismatch = 0;
    for (let i = 0; i < closed.length; i++) {
      if (Math.abs(closed[i] - open[i]) > 8) cycle++;
      if (closed[i] !== repeated[i]) mismatch++;
      if (i >= 192 * 144 * 4 && closed[i] !== open[i]) vesselMismatch++;
      if (Math.abs(onBeat[i] - betweenBeats[i]) > 8) tempoCycle++;
    }
    frame.beatPhase = 0.37;
    frame.bass = frame.mid = 0;
    capture(0);
    const baseline = (scene as any).extra.uValveOpen.value.toArray();
    frame.bass = 1;
    capture(0);
    const bassValves = (scene as any).extra.uValveOpen.value.toArray();
    frame.bass = 0;
    frame.mid = 1;
    capture(0);
    const midValves = (scene as any).extra.uValveOpen.value.toArray();
    scene.dispose();
    target.dispose();
    read.dispose();
    renderer.dispose();
    return {
      cycle,
      mismatch,
      tempoCycle,
      vesselMismatch,
      valveA,
      valveB,
      baseline,
      bassValves,
      midValves,
    };
  });
  expect(result.cycle).toBeGreaterThan(500);
  expect(result.mismatch).toBe(0);
  expect(result.vesselMismatch).toBe(0);
  expect(result.valveA[0]).toBeGreaterThan(result.valveA[1]);
  expect(result.valveB[1]).toBeGreaterThan(result.valveB[0]);
  expect(result.bassValves[0]).toBeGreaterThan(result.baseline[0]);
  expect(result.bassValves[1]).toBe(result.baseline[1]);
  expect(result.midValves[1]).toBeGreaterThan(result.baseline[1]);
  expect(result.midValves[0]).toBe(result.baseline[0]);
  expect(result.tempoCycle).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});
