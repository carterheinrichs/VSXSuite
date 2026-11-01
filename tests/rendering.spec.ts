import { test, expect } from "@playwright/test";

test("psychedelic scenes render distinct audio-reactive images in landscape and portrait", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/");
  const results = await page.evaluate(async () => {
    // @ts-expect-error Browser imports use Vite's source module resolution.
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Vite serves source modules to the integration browser.
    const modules = await import("/src/modules/PsychedelicModules.ts");
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const renderer = new T.WebGLRenderer();
    const audio = new AudioEngine();
    const frame = audio.update(0, 0);
    const results = [];
    for (const Module of [
      modules.PsychedelicBloomModule,
      modules.AcidChromeModule,
      modules.PulseReactorModule,
      modules.PrismaticTunnelModule,
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
        const silent = new Uint8Array(w * h * 4),
          active = new Uint8Array(w * h * 4);
        frame.subBass =
          frame.bass =
          frame.mid =
          frame.treble =
          frame.rms =
          frame.beat =
            0;
        frame.kick = false;
        scene.update(frame, 0, 0);
        scene.render(renderer, target, read);
        renderer.readRenderTargetPixels(target, 0, 0, w, h, silent);
        frame.subBass =
          frame.bass =
          frame.mid =
          frame.treble =
          frame.rms =
          frame.beat =
            0.8;
        frame.kick = true;
        scene.update(frame, 0, 0);
        scene.render(renderer, target, read);
        renderer.readRenderTargetPixels(target, 0, 0, w, h, active);
        let lit = 0,
          changed = 0,
          min = 255,
          max = 0,
          opaque = true;
        for (let i = 0; i < active.length; i += 4) {
          const brightness = (active[i] + active[i + 1] + active[i + 2]) / 3;
          if (brightness > 10) lit++;
          min = Math.min(min, brightness);
          max = Math.max(max, brightness);
          if (
            Math.abs(active[i] - silent[i]) +
              Math.abs(active[i + 1] - silent[i + 1]) +
              Math.abs(active[i + 2] - silent[i + 2]) >
            6
          )
            changed++;
          opaque &&= active[i + 3] === 255;
        }
        results.push({
          id: scene.id,
          lit: lit / (w * h),
          changed: changed / (w * h),
          contrast: max - min,
          opaque,
          signature: Array.from(active.filter((_, i) => i % 257 === 0)).join(
            ",",
          ),
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
    expect(result.lit, result.id).toBeGreaterThan(0.15);
    expect(result.changed, result.id).toBeGreaterThan(0.1);
    expect(result.contrast, result.id).toBeGreaterThan(30);
    expect(result.opaque, result.id).toBe(true);
  }
  expect(new Set(results.map((r) => r.signature)).size).toBe(8);
  expect(errors).toEqual([]);
});

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

test("Evolving Atmosphere reacts to audio, supports ambient silence and repeats after rewind", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite browser module.
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Vite browser module.
    const { EvolvingAtmosphereModule } =
      await import("/src/modules/EvolvingAtmosphereModule.ts");
    // @ts-expect-error Vite browser module.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const renderer = new T.WebGLRenderer();
    const scene = new EvolvingAtmosphereModule();
    const audio = new AudioEngine();
    scene.init(renderer, 96, 64);
    const target = new T.WebGLRenderTarget(96, 64);
    const read = new T.WebGLRenderTarget(96, 64);
    const capture = () => {
      scene.render(renderer, target, read);
      const pixels = new Uint8Array(96 * 64 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 96, 64, pixels);
      return pixels;
    };
    const brightness = (pixels: Uint8Array) =>
      pixels.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : value), 0);
    const frame = audio.frame;
    scene.update(frame, 0, 1 / 30);
    const silent = brightness(capture());
    scene.params.ambient = true;
    scene.update(frame, 0, 1 / 30);
    const ambient = brightness(capture());
    scene.params.ambient = false;
    const run = () => {
      for (let i = 0; i < 40; i++) {
        Object.assign(frame, {
          bass: 0.8,
          mid: 0.5,
          treble: 0.6,
          rms: 0.5,
          beat: i % 15 === 0 ? 1 : 0,
          kick: i % 15 === 0,
        });
        scene.update(frame, i / 30, 1 / 30);
      }
      return capture();
    };
    const first = run(),
      second = run();
    const active = brightness(first);
    const repeatable = first.every((value, i) => value === second[i]);
    scene.resize(64, 96);
    target.setSize(64, 96);
    read.setSize(64, 96);
    scene.render(renderer, target, read);
    scene.dispose();
    target.dispose();
    read.dispose();
    audio.dispose();
    renderer.dispose();
    return { silent, ambient, active, repeatable };
  });
  expect(result.active).toBeGreaterThan(result.silent * 3);
  expect(result.ambient).toBeGreaterThan(result.silent * 3);
  expect(result.repeatable).toBe(true);
  expect(errors).toEqual([]);
});
