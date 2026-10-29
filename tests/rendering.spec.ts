import { test, expect } from "@playwright/test";

test("fused HDR overlay preserves separate-pass output and saves one draw", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  const results = await page.evaluate(async () => {
    // @ts-expect-error Browser imports use Vite's source module resolution.
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { FullscreenPass, target } = await import("/src/shaders/shared.ts");
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { MasterPostFXModule } =
      await import("/src/modules/MasterPostFXModule.ts");
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const canvas = document.createElement("canvas");
    const renderer = new T.WebGLRenderer({
      canvas,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(96, 64);
    renderer.info.autoReset = false;
    const gl = renderer.getContext();
    const base = target(96, 64),
      neon = target(96, 64),
      combined = target(96, 64);
    const fill = new FullscreenPass(
      `varying vec2 vUv;uniform float phase;void main(){vec3 c=vec3(vUv.x,vUv.y,.5+.5*sin(vUv.x*37.+phase));gl_FragColor=vec4(c*c*4.,1.);}`,
      { phase: { value: 0 } },
    );
    fill.render(renderer, base);
    fill.material.uniforms.phase.value = 2;
    fill.render(renderer, neon);
    const copy = new FullscreenPass(
      `varying vec2 vUv;uniform sampler2D base,neon;void main(){gl_FragColor=vec4(texture2D(base,vUv).rgb+texture2D(neon,vUv).rgb*.22,1.);}`,
      { base: { value: base.texture }, neon: { value: neon.texture } },
    );
    // Exercise the original two-triangle rasterization in the reference path.
    const triangle = copy.geometry;
    const quad = new T.PlaneGeometry(2, 2);
    copy.scene.children[0].geometry = quad;
    const post = new MasterPostFXModule();
    post.init(renderer, 96, 64);
    const audio = new AudioEngine();
    const frame = audio.update(1, 1 / 60);
    frame.beat = 0.8;
    const reference = new Uint8Array(96 * 64 * 4);
    const fused = new Uint8Array(reference.length);
    const results = [];
    for (const bloom of [0.35, 0, 1]) {
      post.params.bloom = bloom;
      post.params.chromatic = 1;
      post.params.scanlines = true;
      post.update(frame, 1, 1 / 60);
      renderer.info.reset();
      copy.render(renderer, combined);
      post.renderToScreen(renderer, combined);
      gl.readPixels(0, 0, 96, 64, gl.RGBA, gl.UNSIGNED_BYTE, reference);
      const referenceCalls = renderer.info.render.calls;
      renderer.info.reset();
      post.renderToScreen(renderer, base, neon);
      gl.readPixels(0, 0, 96, 64, gl.RGBA, gl.UNSIGNED_BYTE, fused);
      const fusedCalls = renderer.info.render.calls;
      let maxDifference = 0,
        totalDifference = 0,
        opaque = true;
      for (let i = 0; i < reference.length; i++) {
        const difference = Math.abs(reference[i] - fused[i]);
        maxDifference = Math.max(maxDifference, difference);
        totalDifference += difference;
        if (i % 4 === 3 && fused[i] !== 255) opaque = false;
      }
      // Toggling the overlay off must not retain the previous overlay uniforms.
      post.renderToScreen(renderer, combined);
      const restored = new Uint8Array(reference.length);
      gl.readPixels(0, 0, 96, 64, gl.RGBA, gl.UNSIGNED_BYTE, restored);
      results.push({
        bloom,
        maxDifference,
        meanDifference: totalDifference / reference.length,
        opaque,
        savedCalls: referenceCalls - fusedCalls,
        restored: restored.every((value, i) => value === reference[i]),
        autoClear: renderer.autoClear,
      });
    }
    copy.scene.children[0].geometry = triangle;
    quad.dispose();
    copy.dispose();
    fill.dispose();
    post.dispose();
    audio.dispose();
    base.dispose();
    neon.dispose();
    combined.dispose();
    renderer.dispose();
    return results;
  });
  for (const result of results) {
    // Omitting the intermediate half-float store can change the last display bit.
    expect(result.maxDifference).toBeLessThanOrEqual(1);
    expect(result.meanDifference).toBeLessThan(0.1);
    expect(result.opaque).toBe(true);
    expect(result.savedCalls).toBe(1);
    expect(result.restored).toBe(true);
    expect(result.autoClear).toBe(true);
  }
  expect(errors).toEqual([]);
});
