import { test, expect } from "@playwright/test";

test("cyclic automaton evolves, repeats after reset and preserves state on resize", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.locator('[data-scene="cyclic-automaton"]')).toBeVisible();
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Vite module
    const { CyclicAutomatonModule } =
      await import("/src/modules/CyclicAutomatonModule.ts");
    // @ts-expect-error Vite module
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const r = new T.WebGLRenderer();
    const audio = new AudioEngine();
    const scene = new CyclicAutomatonModule();
    scene.init(r, 96, 96);
    await scene.prepare(r);
    const output = new T.WebGLRenderTarget(96, 96);
    const capture = () => {
      scene.render(r, output);
      const bytes = new Uint8Array(96 * 96 * 4);
      r.readRenderTargetPixels(output, 0, 0, 96, 96, bytes);
      return bytes;
    };
    const run = () => {
      scene.reset();
      scene.update(audio.frame, 0, 0);
      const first = capture();
      for (let i = 1; i <= 60; i++) {
        scene.update(audio.frame, i / 30, 1 / 30);
        scene.render(r, output);
      }
      return { first, last: capture() };
    };
    const a = run(),
      b = run();
    scene.resize(160, 90);
    scene.resize(96, 96);
    const resized = capture();
    Object.assign(audio.frame, { bass: 0.8, beat: 1 });
    scene.update(audio.frame, 3, 0);
    const reactive = capture();
    const equal = (x: Uint8Array, y: Uint8Array) =>
      x.every((v, i) => v === y[i]);
    scene.params.speed = 0;
    scene.params.reactivity = 0;
    scene.update(audio.frame, 4, 0);
    const disabled = capture();
    Object.assign(audio.frame, {
      bass: 0,
      beat: 0,
      mid: 1,
      treble: 1,
      highAttack: 1,
    });
    scene.update(audio.frame, 5, 0);
    const disabledWithAttack = capture();
    scene.params.reactivity = 1;
    scene.update(audio.frame, 6, 0);
    const attack = capture();
    const result = {
      lit: a.first.some((v, i) => i % 4 !== 3 && v > 30),
      evolves: !equal(a.first, a.last),
      repeats: equal(a.last, b.last),
      resize: equal(b.last, resized),
      reactive: !equal(resized, reactive),
      disabled: equal(disabled, disabledWithAttack),
      attack: !equal(disabledWithAttack, attack),
    };
    scene.dispose();
    output.dispose();
    audio.dispose();
    r.dispose();
    return result;
  });
  expect(result).toEqual({
    lit: true,
    evolves: true,
    repeats: true,
    resize: true,
    reactive: true,
    disabled: true,
    attack: true,
  });
  expect(errors).toEqual([]);
});
