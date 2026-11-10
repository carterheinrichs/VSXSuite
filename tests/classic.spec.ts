import { test, expect } from "@playwright/test";

test("new classics render, react to audio and accept customization", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  const results = await page.evaluate(async () => {
    // @ts-expect-error Vite browser module.
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Vite browser module.
    const M = await import("/src/modules/ClassicModules.ts");
    // @ts-expect-error Vite browser module.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const renderer = new T.WebGLRenderer();
    const audio = new AudioEngine();
    const results = [];
    for (const Module of [
      M.HarmonicWavesModule,
      M.RadialSpectrumModule,
      M.RetroPlasmaModule,
    ]) {
      const scene = new Module();
      scene.init(renderer, 128, 80);
      for (const [w, h] of [
        [128, 80],
        [80, 128],
      ]) {
        scene.resize(w, h);
        const target = new T.WebGLRenderTarget(w, h);
        const read = new T.WebGLRenderTarget(w, h);
        const capture = () => {
          scene.update(audio.frame, 1, 1 / 60);
          scene.render(renderer, target, read);
          const pixels = new Uint8Array(w * h * 4);
          renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
          return pixels;
        };
        audio.bytes.fill(0, 0, 512);
        audio.texture.needsUpdate = true;
        Object.assign(audio.frame, { bass: 0, rms: 0 });
        const silent = capture();
        audio.bytes.fill(180, 0, 512);
        audio.texture.needsUpdate = true;
        Object.assign(audio.frame, { bass: 0.8, rms: 0.7 });
        const active = capture();
        if (scene.id === "harmonic-waves")
          scene.params.waveCount = scene.params.waveCount === 2 ? 3 : 2;
        else if (scene.id === "radial-spectrum")
          scene.params.bands = scene.params.bands === 32 ? 64 : 32;
        else scene.params.scale = scene.params.scale === 2 ? 1 : 2;
        const custom = capture();
        results.push({
          id: scene.id,
          lit: active.some((v: number, i: number) => i % 4 !== 3 && v > 25),
          reactive: active.some((v: number, i: number) => v !== silent[i]),
          custom: custom.some((v: number, i: number) => v !== active[i]),
        });
        target.dispose();
        read.dispose();
      }
      scene.dispose();
    }
    audio.dispose();
    renderer.dispose();
    return results;
  });
  for (const result of results) {
    expect(result.lit, result.id).toBe(true);
    expect(result.reactive, result.id).toBe(true);
    expect(result.custom, result.id).toBe(true);
  }
  expect(errors).toEqual([]);
});
