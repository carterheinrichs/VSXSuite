import { test, expect } from "@playwright/test";

test("math grammar handles precedence, music variables and invalid input", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { compileExpression: compile } =
      await import("/src/math/expression.ts");
    const v = { x: 3, t: 0, bass: 0.5 };
    return {
      values: [
        "2x + 1",
        "-x^2",
        "2^3^2",
        "sin(pi/2) + bass",
        "sqrt(abs(-4))",
        "2^-2",
      ].map((s) => compile(s)(v)),
      rejected: [
        "window.alert(1)",
        "sin(x",
        "x;alert(1)",
        "",
        "x".repeat(300),
      ].map((s) => {
        try {
          compile(s);
          return false;
        } catch {
          return true;
        }
      }),
    };
  });
  expect(result.values).toEqual([7, -9, 512, 1.5, 2, 0.25]);
  expect(result.rejected).toEqual([true, true, true, true, true]);
});

test("creative scenes render, customize, respond to music and recover from bad equations", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await page.goto("/");
  for (const [id, title] of [
    ["text-stage", "TEXT STAGE"],
    ["function-stage", "FUNCTION STAGE"],
  ]) {
    await page.locator(`[data-scene="${id}"]`).click();
    await page.getByRole("button", { name: title, exact: true }).click();
  }
  const results = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Vite module
    const M = await import("/src/modules/CreativeModules.ts");
    // @ts-expect-error Vite module
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const renderer = new T.WebGLRenderer();
    const audio = new AudioEngine();
    const results = [];
    for (const Module of [M.TextStageModule, M.FunctionStageModule]) {
      const scene = new Module();
      scene.init(renderer, 256, 144);
      for (const [w, h] of [
        [256, 144],
        [144, 256],
      ]) {
        scene.resize(w, h);
        const target = new T.WebGLRenderTarget(w, h);
        const capture = () => {
          scene.update(audio.frame, 1, 1 / 60);
          scene.render(renderer, target, target);
          const pixels = new Uint8Array(w * h * 4);
          renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
          return pixels;
        };
        Object.assign(audio.frame, { bass: 0, rms: 0, treble: 0 });
        const silent = capture();
        Object.assign(audio.frame, { bass: 0.8, rms: 0.7, treble: 0.6 });
        const active = capture();
        if (scene.id === "text-stage")
          scene.params.text = w > h ? "HELLO | WORLD" : "PORTRAIT";
        else scene.params.function1 = "x^2 - 2";
        const custom = capture();
        // Repeated rendering at the same song time is deterministic for export.
        const repeated = capture();
        results.push({
          lit: active.some((v: number, i: number) => i % 4 !== 3 && v > 25),
          reactive: active.some((v: number, i: number) => v !== silent[i]),
          custom: custom.some((v: number, i: number) => v !== active[i]),
          deterministic: repeated.every(
            (v: number, i: number) => v === custom[i],
          ),
        });
        if (scene.id === "function-stage") {
          scene.params.function1 = "sin(";
          capture();
          results.push({ invalid: scene.params.status.includes("y1:") });
          scene.params.function1 = "1/x";
          capture();
          results.push({ recovered: scene.params.status.startsWith("Valid") });
        }
        target.dispose();
      }
      scene.dispose();
    }
    audio.dispose();
    renderer.dispose();
    return results;
  });
  for (const result of results)
    for (const [key, value] of Object.entries(result))
      expect(value, JSON.stringify({ key, result, results })).toBe(true);
  expect(errors).toEqual([]);
});
