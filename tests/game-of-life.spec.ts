import { test, expect } from "@playwright/test";

test("Conway's Game of Life patterns, curated evolution, presets, reset, resize and audio reactivity", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expect(page.locator('[data-scene="game-of-life"]')).toBeVisible();
  await expect(page.locator('[data-scene="game-of-life"] small')).toHaveText(
    "Geometric",
  );

  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const T = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Vite module
    const { GameOfLifeModule, GAME_OF_LIFE_PATTERNS } =
      await import("/src/modules/GameOfLifeModule.ts");
    // @ts-expect-error Vite module
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");

    // 1. Verify iconic pattern definitions under exact B3/S23 rules.
    const stepSet = (set: Set<string>) => {
      const counts = new Map<string, number>();
      for (const k of set) {
        const [x, y] = k.split(",").map(Number);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nk = `${x + dx},${y + dy}`;
            counts.set(nk, (counts.get(nk) || 0) + 1);
          }
        }
      }
      const next = new Set<string>();
      for (const [k, c] of counts) {
        if (c === 3 || (c === 2 && set.has(k))) next.add(k);
      }
      return next;
    };

    const toSet = (p: { width: number; height: number; cells: Uint8Array }) => {
      const s = new Set<string>();
      for (let y = 0; y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
          if (p.cells[y * p.width + x]) s.add(`${x},${y}`);
        }
      }
      return s;
    };

    const matchesShifted = (a: Set<string>, b: Set<string>, dx = 0, dy = 0) => {
      if (a.size !== b.size) return false;
      for (const k of a) {
        const [x, y] = k.split(",").map(Number);
        if (!b.has(`${x + dx},${y + dy}`)) return false;
      }
      return true;
    };

    const verifyPattern = (
      p: { width: number; height: number; cells: Uint8Array },
      period: number,
      dx = 0,
      dy = 0,
    ) => {
      const orig = toSet(p);
      let cur = orig;
      for (let i = 0; i < period; i++) cur = stepSet(cur);
      return matchesShifted(orig, cur, dx, dy);
    };

    const gunOrig = toSet(GAME_OF_LIFE_PATTERNS.gosperGun);
    let gunAfter30 = gunOrig;
    for (let i = 0; i < 30; i++) gunAfter30 = stepSet(gunAfter30);
    const gosperGunValid =
      gunOrig.size === 36 &&
      gunAfter30.size === 41 &&
      [...gunOrig].every((k) => gunAfter30.has(k));

    const patternsValid =
      verifyPattern(GAME_OF_LIFE_PATTERNS.glider, 4, 1, 1) &&
      verifyPattern(GAME_OF_LIFE_PATTERNS.lwss, 4, 2, 0) &&
      verifyPattern(GAME_OF_LIFE_PATTERNS.mwss, 4, 2, 0) &&
      verifyPattern(GAME_OF_LIFE_PATTERNS.hwss, 4, 2, 0) &&
      verifyPattern(GAME_OF_LIFE_PATTERNS.pulsar, 3) &&
      verifyPattern(GAME_OF_LIFE_PATTERNS.galaxy, 8) &&
      verifyPattern(GAME_OF_LIFE_PATTERNS.pentadecathlon, 15) &&
      verifyPattern(GAME_OF_LIFE_PATTERNS.octagon2, 5) &&
      verifyPattern(GAME_OF_LIFE_PATTERNS.figureEight, 8) &&
      verifyPattern(GAME_OF_LIFE_PATTERNS.queenBeeShuttle, 30) &&
      gosperGunValid;

    // 2. Verify WebGL rendering, determinism, resize retention, presets, curation & audio response.
    const r = new T.WebGLRenderer();
    const audio = new AudioEngine();
    const scene = new GameOfLifeModule();
    scene.init(r, 128, 72);
    await scene.prepare(r);
    const output = new T.WebGLRenderTarget(128, 72);

    const capture = () => {
      scene.render(r, output);
      const bytes = new Uint8Array(128 * 72 * 4);
      r.readRenderTargetPixels(output, 0, 0, 128, 72, bytes);
      return bytes;
    };

    const equal = (x: Uint8Array, y: Uint8Array) =>
      x.every((v, i) => v === y[i]);

    const litFraction = (bytes: Uint8Array) => {
      let lit = 0;
      for (let i = 0; i < bytes.length; i += 4) {
        if (bytes[i] > 35 || bytes[i + 1] > 35 || bytes[i + 2] > 35) lit++;
      }
      return lit / (bytes.length / 4);
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

    const a = run();
    const b = run();

    scene.resize(192, 108);
    scene.resize(128, 72);
    const resized = capture();

    Object.assign(audio.frame, { bass: 0.8, beat: 1 });
    scene.update(audio.frame, 3, 0);
    const reactive = capture();

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

    // Check all choreography presets render distinct lit openings.
    scene.params.speed = 1;
    scene.params.reactivity = 1;
    Object.assign(audio.frame, {
      bass: 0,
      mid: 0,
      treble: 0,
      beat: 0,
      kick: false,
      lowAttack: 0,
      midAttack: 0,
      highAttack: 0,
    });
    const presetFrames: Uint8Array[] = [];
    for (const preset of [
      "showcase",
      "guns",
      "oscillators",
      "blooms",
    ] as const) {
      scene.params.preset = preset;
      scene.reset();
      scene.update(audio.frame, 0, 0);
      presetFrames.push(capture());
    }
    const presetsDistinct =
      presetFrames.every((frame) => litFraction(frame) > 0.015) &&
      !equal(presetFrames[0], presetFrames[1]) &&
      !equal(presetFrames[0], presetFrames[2]) &&
      !equal(presetFrames[0], presetFrames[3]);

    // Sustained musical run: finger on the scale keeps balanced, lively shapes.
    scene.params.preset = "showcase";
    scene.params.curation = 0.85;
    scene.reset();
    let t = 0;
    for (let i = 0; i < 240; i++) {
      const kick = i % 15 === 0;
      const midHit = i % 15 === 7;
      const highHit = i % 10 === 4;
      Object.assign(audio.frame, {
        bass: kick ? 0.85 : 0.35,
        mid: midHit ? 0.75 : 0.35,
        treble: highHit ? 0.7 : 0.25,
        beat: kick ? 1 : 0.15,
        kick,
        lowAttack: kick ? 0.9 : 0,
        midAttack: midHit ? 0.85 : 0,
        highAttack: highHit ? 0.85 : 0,
      });
      t += 1 / 30;
      scene.update(audio.frame, t, 1 / 30);
    }
    const sustainedLit = litFraction(capture());

    const summary = {
      patternsValid,
      lit: litFraction(a.first) > 0.02,
      evolves: !equal(a.first, a.last),
      repeats: equal(a.last, b.last),
      resize: equal(b.last, resized),
      reactive: !equal(resized, reactive),
      disabled: equal(disabled, disabledWithAttack),
      attack: !equal(disabledWithAttack, attack),
      presetsDistinct,
      sustainedBalanced: sustainedLit > 0.03 && sustainedLit < 0.75,
    };

    scene.dispose();
    output.dispose();
    audio.dispose();
    r.dispose();
    return summary;
  });

  expect(result).toEqual({
    patternsValid: true,
    lit: true,
    evolves: true,
    repeats: true,
    resize: true,
    reactive: true,
    disabled: true,
    attack: true,
    presetsDistinct: true,
    sustainedBalanced: true,
  });
  expect(errors).toEqual([]);
});
