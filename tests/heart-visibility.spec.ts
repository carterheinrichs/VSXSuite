import { test, expect } from "@playwright/test";
test("heart optimization preserves original pixels", async ({ page }) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    // @ts-expect-error Browser imports use Vite source resolution.
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser imports use Vite source resolution.
    const { HumanHeartModule: Current } =
      await import("/src/modules/HumanHeartModule.ts");

    // @ts-expect-error Browser imports use Vite source resolution.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const renderer = new T.WebGLRenderer();
    const audio = new AudioEngine();
    const frame = audio.update(0, 0);
    const results = [];
    for (const [width, height] of [
      [256, 144],
      [144, 256],
      [192, 192],
    ]) {
      const scenes = [new Current(), new Current()];
      scenes.forEach((s) => s.init(renderer, width, height));
      // Disable only the broad-phase rejection to compare against the full march.
      const originalMaterial = (scenes[0] as any).pass.material;
      expectGuard(originalMaterial.fragmentShader);
      originalMaterial.fragmentShader = originalMaterial.fragmentShader.replace(
        "if(dot(nearest,nearest)<=2.25)",
        "if(true)",
      );
      // Compare runtime loop bounds with the original constant-bound shader too.
      for (const [name, count] of Object.entries({
        uMarchSteps: 72,
        uShadowSteps: 8,
        uBranchSteps: 3,
        uSideSteps: 2,
        uVesselSteps: 7,
      })) {
        originalMaterial.fragmentShader =
          originalMaterial.fragmentShader.replaceAll(`<${name}`, `<${count}`);
      }
      function expectGuard(source: string) {
        if (!source.includes("if(dot(nearest,nearest)<=2.25)"))
          throw new Error("Heart visibility guard missing");
      }
      const target = new T.WebGLRenderTarget(width, height);
      const read = new T.WebGLRenderTarget(width, height);
      const capture = (scene: InstanceType<typeof Current>, time: number) => {
        scene.update(frame, time, 1 / 30);
        scene.render(renderer, target, read);
        const pixels = new Uint8Array(width * height * 4);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        return pixels;
      };
      for (const cutaway of [true, false])
        for (const time of [0, 0.12 / 1.12, 0.65 / 1.12, 9]) {
          scenes.forEach((s) => {
            s.params.cutaway = cutaway;
          });
          const a = capture(scenes[0], time),
            b = capture(scenes[1], time);
          let mismatch = 0;
          for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) mismatch++;
          results.push({ width, height, cutaway, time, mismatch });
        }

      scenes.forEach((s) => s.dispose());
      target.dispose();
      read.dispose();
    }
    renderer.dispose();
    return results;
  });

  for (const row of results)
    if ("mismatch" in row) expect(row.mismatch).toBe(0);
});
