import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { common, FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";

export interface LifePattern {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  readonly kind: "gun" | "oscillator" | "spaceship" | "methuselah";
}

function parsePattern(
  name: string,
  kind: LifePattern["kind"],
  rows: readonly string[],
): LifePattern {
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      cells[y * width + x] = row.charCodeAt(x) === 35 ? 1 : 0; // '#'
    }
  }
  return { name, width, height, cells, kind };
}

/** Verified iconic Conway's Game of Life (B3/S23) patterns. */
export const GAME_OF_LIFE_PATTERNS = {
  glider: parsePattern("glider", "spaceship", [".#.", "..#", "###"]),
  lwss: parsePattern("lwss", "spaceship", ["#..#.", "....#", "#...#", ".####"]),
  mwss: parsePattern("mwss", "spaceship", [
    "..#...",
    "#...#.",
    ".....#",
    "#....#",
    ".#####",
  ]),
  hwss: parsePattern("hwss", "spaceship", [
    "..##...",
    "#....#.",
    "......#",
    "#.....#",
    ".######",
  ]),
  pulsar: parsePattern("pulsar", "oscillator", [
    "..###...###..",
    ".............",
    "#....#.#....#",
    "#....#.#....#",
    "#....#.#....#",
    "..###...###..",
    ".............",
    "..###...###..",
    "#....#.#....#",
    "#....#.#....#",
    "#....#.#....#",
    ".............",
    "..###...###..",
  ]),
  galaxy: parsePattern("galaxy", "oscillator", [
    "######.##",
    "######.##",
    ".......##",
    "##.....##",
    "##.....##",
    "##.....##",
    "##.......",
    "##.######",
    "##.######",
  ]),
  pentadecathlon: parsePattern("pentadecathlon", "oscillator", [
    "..#....#..",
    "##.####.##",
    "..#....#..",
  ]),
  octagon2: parsePattern("octagon2", "oscillator", [
    "...##...",
    "..#..#..",
    ".#....#.",
    "#......#",
    "#......#",
    ".#....#.",
    "..#..#..",
    "...##...",
  ]),
  figureEight: parsePattern("figureEight", "oscillator", [
    "###...",
    "###...",
    "###...",
    "...###",
    "...###",
    "...###",
  ]),
  queenBeeShuttle: parsePattern("queenBeeShuttle", "oscillator", [
    ".........#............",
    ".......#.#............",
    "......#.#.............",
    "##...#..#...........##",
    "##....#.#...........##",
    ".......#.#............",
    ".........#............",
  ]),
  gosperGun: parsePattern("gosperGun", "gun", [
    "........................#...........",
    "......................#.#...........",
    "............##......##............##",
    "...........#...#....##............##",
    "##........#.....#...##..............",
    "##........#...#.##....#.#...........",
    "..........#.....#.......#...........",
    "...........#...#....................",
    "............##......................",
  ]),
  rPentomino: parsePattern("rPentomino", "methuselah", [".##", "##.", ".#."]),
  piHeptomino: parsePattern("piHeptomino", "methuselah", ["###", "#.#", "#.#"]),
  acorn: parsePattern("acorn", "methuselah", [".#.....", "...#...", "##..###"]),
} as const;

export type LifePreset = "showcase" | "guns" | "oscillators" | "blooms";

const displayShader =
  common +
  `
uniform sampler2D uState;
uniform vec2 uGrid;
uniform float uHue,uIntensity,uReactivity,uPulse,uHighPulse,uTrails;

void main(){
  // Keep every cell strictly square without edge tiling across 16:9, 1:1, or 9:16.
  vec2 aspect=uResolution/max(uResolution.x,uResolution.y);
  vec2 centered=(vUv-.5)*aspect;
  float zoom=1.+uReactivity*(uBass*.034+uPulse*.024);
  vec2 uv=centered/zoom+.5;

  vec2 gridUv=fract(uv);
  vec2 texel=1./uGrid;
  vec4 cell=texture2D(uState,gridUv);

  float age=cell.r*255.;
  float alive=step(.5,age);
  float newborn=alive*(1.-step(1.5,age));
  float maturity=clamp((age-1.)/36.,0.,1.);
  float trail=cell.g;
  float species=cell.b;
  float energy=cell.a;

  // Sub-cell rounded tile geometry so iconic Conway shapes stay crisp and jewel-like.
  vec2 f=fract(uv*uGrid)-.5;
  vec2 q=abs(f)-vec2(.29);
  float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-.09;
  float tile=1.-smoothstep(-.055,.045,sd);
  float rim=smoothstep(.095,-.015,abs(sd));
  float core=1.-smoothstep(0.,.36,length(f));

  // Local neighborhood energy for soft HDR bloom halos around active formations.
  vec4 nL=texture2D(uState,fract(uv+vec2(-texel.x,0.)));
  vec4 nR=texture2D(uState,fract(uv+vec2(texel.x,0.)));
  vec4 nD=texture2D(uState,fract(uv+vec2(0.,-texel.y)));
  vec4 nU=texture2D(uState,fract(uv+vec2(0.,texel.y)));
  float halo=(
    step(.5,nL.r*255.)+step(.5,nR.r*255.)+step(.5,nD.r*255.)+step(.5,nU.r*255.)
    +(nL.g+nR.g+nD.g+nU.g)*.55
  )*.25;

  float audioShift=uReactivity*(uMid*.06+uPulse*.035);
  vec3 baseCol=palette(species+uHue+maturity*.14+audioShift);
  vec3 trailCol=palette(species+uHue-.08+audioShift*.6);
  baseCol=pow(max(baseCol,0.),vec3(1.18));
  trailCol=pow(max(trailCol,0.),vec3(1.35));

  // Deep obsidian cyber-grid backdrop with faint reactive lattice near activity.
  float edgeLine=smoothstep(.43,.5,max(abs(f.x),abs(f.y)));
  float gridGlow=edgeLine*(.028+halo*.16+uReactivity*(uTreble*.08+uHighPulse*.14)*(halo+.15));
  vec3 bg=vec3(.012,.015,.028)*(1.-.38*dot(centered,centered));
  bg+=trailCol*gridGlow;
  bg+=trailCol*halo*.18*(.75+uReactivity*(uBass*.45+uPulse*.35));

  // Phosphor wake on recently vacated cells.
  float trailShape=mix(.65,1.,tile);
  float trailAmt=pow(trail,1.35)*uTrails*(1.-alive*.65)*trailShape;
  vec3 col=bg+trailCol*trailAmt*(.78+uReactivity*(uMid*.35+uPulse*.45));

  // Living cells: saturated body, crisp rim, hot core, and HDR newborn/beat flare.
  float flash=newborn*.48+energy*.62;
  float beatLift=1.+uReactivity*(uBass*.55+uPulse*.65+uHighPulse*.35*rim);
  vec3 aliveCol=mix(baseCol,vec3(1.,.98,.94),clamp(flash*.52+core*.22,0.,.75));
  aliveCol+=baseCol*rim*(.38+uReactivity*(uTreble*.55+uHighPulse*.7));
  col=mix(col,aliveCol*(1.12+flash*.75)*beatLift,alive*tile);
  col+=baseCol*alive*(1.-tile)*.28*beatLift;

  gl_FragColor=vec4(col*uIntensity,1.);
}
`;

function wrapIndex(value: number, size: number): number {
  const m = value % size;
  return m < 0 ? m + size : m;
}

/**
 * Conway's Game of Life (B3/S23) with musical choreography ("finger on the scale"):
 * runs authentic Life rules while dissolving stagnant ash, preventing extinction or
 * chaotic overcrowding, and staging iconic guns, oscillators, spaceships, and blooms.
 */
export class GameOfLifeModule extends ShaderModule {
  readonly id = "game-of-life";
  readonly name = "Conway's Game of Life";

  params = {
    preset: "showcase" as LifePreset,
    curation: 0.85,
    speed: 1,
    intensity: 1.35,
    hue: 0,
    reactivity: 1,
    trails: 0.72,
    cells: 160,
    seed: 1,
  };

  controls = {
    preset: {
      label: "Choreography",
      options: {
        Showcase: "showcase",
        "Guns & Fleets": "guns",
        "Oscillator Garden": "oscillators",
        "Symmetric Blooms": "blooms",
      },
    },
    curation: { min: 0, max: 1, step: 0.05, label: "Shape bias" },
    speed: { min: 0, max: 3, step: 0.05 },
    intensity: { min: 0.4, max: 2.5, step: 0.05 },
    hue: { min: 0, max: 1, step: 0.01 },
    reactivity: { min: 0, max: 2, step: 0.05 },
    trails: { min: 0, max: 0.95, step: 0.01, label: "Afterglow" },
    cells: { min: 96, max: 256, step: 16, label: "Cells across" },
    seed: { min: 1, max: 100, step: 1 },
  };

  private size = 0;
  private alive = new Uint8Array(0);
  private nextAlive = new Uint8Array(0);
  private prev1 = new Uint8Array(0);
  private prev2 = new Uint8Array(0);
  private age = new Uint8Array(0);
  private nextAge = new Uint8Array(0);
  private hueBuf = new Float32Array(0);
  private nextHue = new Float32Array(0);
  private trail = new Float32Array(0);
  private energy = new Float32Array(0);
  private stillness = new Uint16Array(0);
  private protectedUntil = new Uint32Array(0);
  private texData = new Uint8Array(0);
  private stateTexture!: T.DataTexture;

  private rngState = 1;
  private generation = 0;
  private accumulator = 0;
  private pulse = 0;
  private highPulse = 0;
  private hueCursor = 0.08;
  private lastHeroGen = 0;
  private lastFleetGen = 0;
  private lastSparkleGen = 0;
  private lastGunGen = 0;
  private quietGenerations = 0;
  private pendingLowCue = false;
  private pendingMidCue = false;
  private pendingHighCue = false;
  private dirtyTexture = true;

  private appliedCells = -1;
  private appliedSeed = -1;
  private appliedPreset = "" as LifePreset | "";

  private readonly look = {
    uState: { value: null as T.Texture | null },
    uGrid: { value: new T.Vector2(160, 160) },
    uHue: { value: 0 },
    uIntensity: { value: 1.35 },
    uReactivity: { value: 1 },
    uPulse: { value: 0 },
    uHighPulse: { value: 0 },
    uTrails: { value: 0.72 },
  };

  init(_renderer: T.WebGLRenderer, w: number, h: number) {
    this.allocateGrid(this.params.cells);
    this.pass = new FullscreenPass(displayShader, {
      ...this.uniforms,
      ...this.look,
    });
    this.resize(w, h);
    this.seedStage();
  }

  private allocateGrid(size: number) {
    if (this.size === size && this.stateTexture) return;
    this.size = size;
    const count = size * size;
    this.alive = new Uint8Array(count);
    this.nextAlive = new Uint8Array(count);
    this.prev1 = new Uint8Array(count);
    this.prev2 = new Uint8Array(count);
    this.age = new Uint8Array(count);
    this.nextAge = new Uint8Array(count);
    this.hueBuf = new Float32Array(count);
    this.nextHue = new Float32Array(count);
    this.trail = new Float32Array(count);
    this.energy = new Float32Array(count);
    this.stillness = new Uint16Array(count);
    this.protectedUntil = new Uint32Array(count);
    this.texData = new Uint8Array(count * 4);
    this.stateTexture?.dispose();
    this.stateTexture = new T.DataTexture(
      this.texData,
      size,
      size,
      T.RGBAFormat,
      T.UnsignedByteType,
    );
    this.stateTexture.minFilter = T.NearestFilter;
    this.stateTexture.magFilter = T.NearestFilter;
    this.stateTexture.wrapS = T.RepeatWrapping;
    this.stateTexture.wrapT = T.RepeatWrapping;
    this.stateTexture.generateMipmaps = false;
    this.stateTexture.needsUpdate = true;
    this.look.uState.value = this.stateTexture;
    this.look.uGrid.value.set(size, size);
    this.dirtyTexture = true;
  }

  private random(): number {
    // Mulberry32 deterministic PRNG (zero allocations).
    this.rngState = (this.rngState + 0x6d2b79f5) | 0;
    let t = Math.imul(
      this.rngState ^ (this.rngState >>> 15),
      1 | this.rngState,
    );
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private nextColorHue(): number {
    this.hueCursor = (this.hueCursor + 0.61803398875) % 1;
    return this.hueCursor;
  }

  private clearAll() {
    this.alive.fill(0);
    this.nextAlive.fill(0);
    this.prev1.fill(0);
    this.prev2.fill(0);
    this.age.fill(0);
    this.nextAge.fill(0);
    this.hueBuf.fill(0);
    this.nextHue.fill(0);
    this.trail.fill(0);
    this.energy.fill(0);
    this.stillness.fill(0);
    this.protectedUntil.fill(0);
  }

  /**
   * Stamps a pattern centered at (cx, cy) with an optional clean dark margin
   * so the shape runs cleanly without interference from nearby debris.
   */
  private stamp(
    pattern: LifePattern,
    cx: number,
    cy: number,
    hue: number,
    flipX = false,
    flipY = false,
    transpose = false,
    margin = 2,
    protectGens = 180,
    flashEnergy = 0.9,
  ) {
    const n = this.size;
    const outW = transpose ? pattern.height : pattern.width;
    const outH = transpose ? pattern.width : pattern.height;
    const x0 = Math.round(cx - outW * 0.5);
    const y0 = Math.round(cy - outH * 0.5);
    const protectTarget = this.generation + protectGens;

    // Clear landing pad so colliding debris cannot corrupt the shape.
    if (margin >= 0) {
      for (let dy = -margin; dy < outH + margin; dy++) {
        const gy = wrapIndex(y0 + dy, n);
        const row = gy * n;
        for (let dx = -margin; dx < outW + margin; dx++) {
          const gx = wrapIndex(x0 + dx, n);
          const idx = row + gx;
          this.alive[idx] = 0;
          this.prev1[idx] = 0;
          this.prev2[idx] = 0;
          this.age[idx] = 0;
          this.stillness[idx] = 0;
          if (protectGens > 0 && this.protectedUntil[idx] < protectTarget) {
            this.protectedUntil[idx] = protectTarget;
          }
        }
      }
    }

    const pCells = pattern.cells;
    const pW = pattern.width;
    const pH = pattern.height;
    for (let py = 0; py < pH; py++) {
      const sy = flipY ? pH - 1 - py : py;
      for (let px = 0; px < pW; px++) {
        const sx = flipX ? pW - 1 - px : px;
        if (!pCells[sy * pW + sx]) continue;
        const ox = transpose ? py : px;
        const oy = transpose ? px : py;
        const gx = wrapIndex(x0 + ox, n);
        const gy = wrapIndex(y0 + oy, n);
        const idx = gy * n + gx;
        this.alive[idx] = 1;
        this.age[idx] = 1;
        this.hueBuf[idx] = hue;
        this.trail[idx] = 1;
        this.energy[idx] = flashEnergy;
        this.stillness[idx] = 0;
      }
    }
    this.dirtyTexture = true;
  }

  /** Stamps a pattern in 2-way or 4-way mirror symmetry around grid center. */
  private stampMirrored(
    pattern: LifePattern,
    dx: number,
    dy: number,
    hue: number,
    fourWay: boolean,
    transpose = false,
    protectGens = 180,
    flashEnergy = 1,
  ) {
    const half = this.size * 0.5;
    if (fourWay) {
      this.stamp(
        pattern,
        half + dx,
        half + dy,
        hue,
        false,
        false,
        transpose,
        2,
        protectGens,
        flashEnergy,
      );
      this.stamp(
        pattern,
        half - dx,
        half + dy,
        hue,
        true,
        false,
        transpose,
        2,
        protectGens,
        flashEnergy,
      );
      this.stamp(
        pattern,
        half + dx,
        half - dy,
        hue,
        false,
        true,
        transpose,
        2,
        protectGens,
        flashEnergy,
      );
      this.stamp(
        pattern,
        half - dx,
        half - dy,
        hue,
        true,
        true,
        transpose,
        2,
        protectGens,
        flashEnergy,
      );
    } else {
      this.stamp(
        pattern,
        half + dx,
        half + dy,
        hue,
        false,
        false,
        transpose,
        2,
        protectGens,
        flashEnergy,
      );
      this.stamp(
        pattern,
        half - dx,
        half - dy,
        (hue + 0.12) % 1,
        true,
        true,
        transpose,
        2,
        protectGens,
        flashEnergy,
      );
    }
  }

  private seedStage() {
    const n = this.size;
    const half = n * 0.5;
    this.clearAll();
    const seedInt = Math.max(1, Math.round(this.params.seed));
    let presetHash = 17;
    const preset = this.params.preset;
    for (let i = 0; i < preset.length; i++) {
      presetHash = (presetHash * 31 + preset.charCodeAt(i)) | 0;
    }
    this.rngState = (seedInt * 2654435761 + presetHash) >>> 0 || 1;
    this.generation = 0;
    this.accumulator = 0;
    this.lastHeroGen = 0;
    this.lastFleetGen = 0;
    this.lastSparkleGen = 0;
    this.lastGunGen = 0;
    this.quietGenerations = 0;
    this.pendingLowCue = false;
    this.pendingMidCue = false;
    this.pendingHighCue = false;
    this.hueCursor = (seedInt * 0.137) % 1;

    const P = GAME_OF_LIFE_PATTERNS;

    if (preset === "guns") {
      const gunHue = this.nextColorHue();
      if (n >= 112) {
        this.stamp(
          P.gosperGun,
          half - n * 0.31,
          half - n * 0.19,
          gunHue,
          false,
          false,
          false,
          2,
          280,
          1,
        );
        this.stamp(
          P.gosperGun,
          half + n * 0.31,
          half + n * 0.19,
          (gunHue + 0.38) % 1,
          true,
          true,
          false,
          2,
          280,
          1,
        );
      } else {
        this.stamp(
          P.gosperGun,
          half - n * 0.24,
          half - n * 0.18,
          gunHue,
          false,
          false,
          false,
          2,
          280,
          1,
        );
      }
      const shipHue = this.nextColorHue();
      this.stamp(
        P.hwss,
        half - n * 0.18,
        half + n * 0.19,
        shipHue,
        false,
        false,
        false,
        2,
        0,
        1,
      );
      this.stamp(
        P.hwss,
        half + n * 0.18,
        half - n * 0.19,
        shipHue,
        true,
        false,
        false,
        2,
        0,
        1,
      );
      const midHue = this.nextColorHue();
      this.stamp(
        P.mwss,
        half - n * 0.34,
        half + n * 0.04,
        midHue,
        false,
        false,
        false,
        2,
        0,
        0.9,
      );
      this.stamp(
        P.mwss,
        half + n * 0.34,
        half - n * 0.04,
        midHue,
        true,
        false,
        false,
        2,
        0,
        0.9,
      );
      this.stamp(
        P.queenBeeShuttle,
        half,
        half,
        this.nextColorHue(),
        false,
        false,
        false,
        2,
        240,
        1,
      );
      this.prewarm(32);
    } else if (preset === "oscillators") {
      this.stamp(
        P.pulsar,
        half,
        half,
        this.nextColorHue(),
        false,
        false,
        false,
        2,
        260,
        1,
      );
      this.stampMirrored(
        P.galaxy,
        n * 0.21,
        n * 0.11,
        this.nextColorHue(),
        true,
        false,
        240,
        1,
      );
      this.stampMirrored(
        P.pentadecathlon,
        n * 0.34,
        n * 0.0,
        this.nextColorHue(),
        false,
        true,
        240,
        0.95,
      );
      this.stampMirrored(
        P.octagon2,
        n * 0.09,
        n * 0.2,
        this.nextColorHue(),
        true,
        false,
        220,
        0.95,
      );
      this.stampMirrored(
        P.figureEight,
        n * 0.35,
        n * 0.18,
        this.nextColorHue(),
        true,
        false,
        220,
        0.9,
      );
      this.prewarm(4);
    } else if (preset === "blooms") {
      // Mirrored methuselah seeds pre-warmed mid-eruption into rich symmetrical mandalas.
      this.stampMirrored(
        P.rPentomino,
        n * 0.07,
        n * 0.05,
        this.nextColorHue(),
        true,
        false,
        120,
        1,
      );
      this.stampMirrored(
        P.piHeptomino,
        n * 0.23,
        n * 0.1,
        this.nextColorHue(),
        true,
        false,
        120,
        0.95,
      );
      this.stampMirrored(
        P.acorn,
        n * 0.14,
        n * 0.16,
        this.nextColorHue(),
        true,
        false,
        120,
        0.95,
      );
      const gliderHue = this.nextColorHue();
      this.stampMirrored(
        P.glider,
        n * 0.35,
        n * 0.16,
        gliderHue,
        true,
        false,
        0,
        0.9,
      );
      this.prewarm(14);
    } else {
      // Showcase: iconic recognizable Conway composition fitting 16:9, 1:1, and 9:16 cleanly.
      const centerHue = this.nextColorHue();
      this.stamp(
        P.pulsar,
        half,
        half,
        centerHue,
        false,
        false,
        false,
        2,
        260,
        1,
      );

      const gunHue = this.nextColorHue();
      if (n >= 112) {
        this.stamp(
          P.gosperGun,
          half - n * 0.32,
          half - n * 0.21,
          gunHue,
          false,
          false,
          false,
          2,
          280,
          1,
        );
        this.stamp(
          P.gosperGun,
          half + n * 0.32,
          half + n * 0.21,
          (gunHue + 0.35) % 1,
          true,
          true,
          false,
          2,
          280,
          1,
        );
      } else {
        this.stamp(
          P.gosperGun,
          half - n * 0.25,
          half - n * 0.2,
          gunHue,
          false,
          false,
          false,
          2,
          280,
          1,
        );
      }

      const galHue = this.nextColorHue();
      this.stamp(
        P.galaxy,
        half - n * 0.24,
        half + n * 0.015,
        galHue,
        false,
        false,
        false,
        2,
        240,
        1,
      );
      this.stamp(
        P.galaxy,
        half + n * 0.24,
        half - n * 0.015,
        (galHue + 0.18) % 1,
        true,
        true,
        false,
        2,
        240,
        1,
      );

      const pentaHue = this.nextColorHue();
      this.stamp(
        P.pentadecathlon,
        half + n * 0.24,
        half - n * 0.17,
        pentaHue,
        false,
        false,
        false,
        2,
        220,
        0.95,
      );
      this.stamp(
        P.pentadecathlon,
        half - n * 0.24,
        half + n * 0.17,
        (pentaHue + 0.12) % 1,
        false,
        false,
        false,
        2,
        220,
        0.95,
      );

      const octHue = this.nextColorHue();
      this.stamp(
        P.octagon2,
        half - n * 0.37,
        half + n * 0.09,
        octHue,
        false,
        false,
        false,
        2,
        200,
        0.9,
      );
      this.stamp(
        P.octagon2,
        half + n * 0.37,
        half - n * 0.09,
        (octHue + 0.22) % 1,
        false,
        false,
        false,
        2,
        200,
        0.9,
      );

      const shipHue = this.nextColorHue();
      this.stamp(
        P.hwss,
        half - n * 0.03,
        half + n * 0.21,
        shipHue,
        true,
        false,
        false,
        2,
        0,
        1,
      );
      this.stamp(
        P.hwss,
        half + n * 0.03,
        half - n * 0.21,
        shipHue,
        false,
        false,
        false,
        2,
        0,
        1,
      );
      this.prewarm(12);
    }

    this.syncTexture();
  }

  private prewarm(generations: number) {
    for (let i = 0; i < generations; i++) {
      this.stepSimulation();
      this.decayFields(1 / 30);
    }
    this.generation = 0;
    this.lastHeroGen = 0;
    this.lastFleetGen = 0;
    this.lastSparkleGen = 0;
    this.lastGunGen = 0;
  }

  private clearArena(radiusFrac: number) {
    const n = this.size;
    const half = n * 0.5;
    const r2 = (n * radiusFrac) ** 2;
    for (let y = 0; y < n; y++) {
      const dy = y - half;
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const dx = x - half;
        if (dx * dx + dy * dy <= r2) {
          const idx = row + x;
          this.alive[idx] = 0;
          this.prev1[idx] = 0;
          this.prev2[idx] = 0;
          this.age[idx] = 0;
          this.stillness[idx] = 0;
          this.energy[idx] = Math.max(this.energy[idx], 0.35);
        }
      }
    }
  }

  private spawnHeroFormation(audioTriggered: boolean) {
    const n = this.size;
    const P = GAME_OF_LIFE_PATTERNS;
    const preset = this.params.preset;
    const hue = this.nextColorHue();
    const energy = audioTriggered ? 1 : 0.85;
    const roll = this.random();

    if (preset === "guns") {
      if (n >= 112 && this.generation - this.lastGunGen > 110 && roll < 0.45) {
        const flipX = this.random() < 0.5;
        const flipY = this.random() < 0.5;
        const sx = (flipX ? 1 : -1) * n * (0.24 + this.random() * 0.1);
        const sy = (flipY ? 1 : -1) * n * (0.12 + this.random() * 0.1);
        this.stamp(
          P.gosperGun,
          n * 0.5 + sx,
          n * 0.5 + sy,
          hue,
          flipX,
          flipY,
          false,
          2,
          260,
          energy,
        );
        this.lastGunGen = this.generation;
      } else if (roll < 0.72) {
        const dy = (this.random() - 0.5) * n * 0.32;
        this.stamp(
          P.queenBeeShuttle,
          n * 0.5,
          n * 0.5 + dy,
          hue,
          false,
          false,
          false,
          2,
          220,
          energy,
        );
      } else {
        this.spawnSpaceshipSquadron(energy);
      }
    } else if (preset === "oscillators") {
      if (roll < 0.28) {
        const ox = (this.random() - 0.5) * n * 0.38;
        const oy = (this.random() - 0.5) * n * 0.24;
        this.stamp(
          P.pulsar,
          n * 0.5 + ox,
          n * 0.5 + oy,
          hue,
          false,
          false,
          false,
          2,
          220,
          energy,
        );
      } else if (roll < 0.54) {
        this.stampMirrored(
          P.galaxy,
          n * (0.14 + this.random() * 0.18),
          n * (0.06 + this.random() * 0.12),
          hue,
          this.random() < 0.5,
          false,
          220,
          energy,
        );
      } else if (roll < 0.78) {
        this.stampMirrored(
          P.pentadecathlon,
          n * (0.16 + this.random() * 0.2),
          n * (0.04 + this.random() * 0.15),
          hue,
          false,
          this.random() < 0.5,
          200,
          energy,
        );
      } else {
        this.stampMirrored(
          P.octagon2,
          n * (0.1 + this.random() * 0.24),
          n * (0.06 + this.random() * 0.14),
          hue,
          true,
          false,
          200,
          energy,
        );
      }
    } else if (preset === "blooms") {
      const dx = n * (0.06 + this.random() * 0.2);
      const dy = n * (0.04 + this.random() * 0.14);
      const seedPattern =
        roll < 0.45 ? P.rPentomino : roll < 0.78 ? P.piHeptomino : P.acorn;
      this.stampMirrored(
        seedPattern,
        dx,
        dy,
        hue,
        true,
        this.random() < 0.5,
        90,
        energy,
      );
    } else {
      // Showcase mix: pulsars, galaxies, guns, pentadecathlons, shuttles, mirrored blooms.
      if (roll < 0.24) {
        const dx = n * (0.12 + this.random() * 0.22);
        const dy = n * (0.05 + this.random() * 0.13);
        if (this.random() < 0.45) {
          this.stamp(
            P.pulsar,
            n * 0.5,
            n * 0.5,
            hue,
            false,
            false,
            false,
            2,
            220,
            energy,
          );
        } else {
          this.stampMirrored(P.pulsar, dx, dy, hue, false, false, 210, energy);
        }
      } else if (roll < 0.46) {
        this.stampMirrored(
          P.galaxy,
          n * (0.14 + this.random() * 0.2),
          n * (0.05 + this.random() * 0.14),
          hue,
          this.random() < 0.4,
          false,
          220,
          energy,
        );
      } else if (roll < 0.62) {
        this.stampMirrored(
          P.pentadecathlon,
          n * (0.15 + this.random() * 0.22),
          n * (0.05 + this.random() * 0.14),
          hue,
          false,
          this.random() < 0.5,
          200,
          energy,
        );
      } else if (
        roll < 0.76 &&
        n >= 112 &&
        this.generation - this.lastGunGen > 130
      ) {
        const flipX = this.random() < 0.5;
        const flipY = this.random() < 0.5;
        const sx = (flipX ? 1 : -1) * n * 0.31;
        const sy = (flipY ? 1 : -1) * n * 0.19;
        this.stamp(
          P.gosperGun,
          n * 0.5 + sx,
          n * 0.5 + sy,
          hue,
          flipX,
          flipY,
          false,
          2,
          260,
          energy,
        );
        this.lastGunGen = this.generation;
      } else if (roll < 0.88) {
        this.stampMirrored(
          P.rPentomino,
          n * (0.08 + this.random() * 0.16),
          n * (0.05 + this.random() * 0.11),
          hue,
          true,
          false,
          90,
          energy,
        );
      } else {
        this.stamp(
          P.queenBeeShuttle,
          n * 0.5 + (this.random() - 0.5) * n * 0.22,
          n * 0.5 + (this.random() - 0.5) * n * 0.22,
          hue,
          false,
          false,
          false,
          2,
          220,
          energy,
        );
      }
    }
    this.lastHeroGen = this.generation;
  }

  private spawnSpaceshipSquadron(energy = 0.95) {
    const n = this.size;
    const half = n * 0.5;
    const P = GAME_OF_LIFE_PATTERNS;
    const hue = this.nextColorHue();
    const pick = this.random();
    const ship = pick < 0.34 ? P.lwss : pick < 0.68 ? P.mwss : P.hwss;
    const vertical = this.random() < 0.25;
    const lane = n * (0.09 + this.random() * 0.13);
    const offset = n * (0.28 + this.random() * 0.12);

    if (vertical) {
      this.stamp(
        ship,
        half - lane,
        half - offset,
        hue,
        false,
        false,
        true,
        2,
        0,
        energy,
      );
      this.stamp(
        ship,
        half + lane,
        half + offset,
        (hue + 0.14) % 1,
        true,
        false,
        true,
        2,
        0,
        energy,
      );
    } else {
      this.stamp(
        ship,
        half - offset,
        half + lane,
        hue,
        false,
        false,
        false,
        2,
        0,
        energy,
      );
      this.stamp(
        ship,
        half + offset,
        half - lane,
        (hue + 0.14) % 1,
        true,
        false,
        false,
        2,
        0,
        energy,
      );
    }
    this.lastFleetGen = this.generation;
  }

  private spawnHighAccent(energy = 1) {
    const n = this.size;
    const P = GAME_OF_LIFE_PATTERNS;
    const hue = this.nextColorHue();
    const dx = n * (0.12 + this.random() * 0.26);
    const dy = n * (0.05 + this.random() * 0.16);
    const roll = this.random();
    if (roll < 0.4) {
      this.stampMirrored(P.octagon2, dx, dy, hue, false, false, 180, energy);
    } else if (roll < 0.72) {
      this.stampMirrored(P.figureEight, dx, dy, hue, false, false, 180, energy);
    } else {
      this.stampMirrored(P.glider, dx, dy, hue, true, false, 0, energy);
    }
    this.lastSparkleGen = this.generation;
  }

  private stepSimulation() {
    const n = this.size;
    const alive = this.alive;
    const nextAlive = this.nextAlive;
    const prev1 = this.prev1;
    const prev2 = this.prev2;
    const age = this.age;
    const nextAge = this.nextAge;
    const hueBuf = this.hueBuf;
    const nextHue = this.nextHue;
    const trail = this.trail;
    const energy = this.energy;
    const stillness = this.stillness;
    const protectedUntil = this.protectedUntil;

    const curation = this.params.curation;
    const ashThreshold = Math.round(96 - curation * 54);
    const generation = ++this.generation;
    const birthBoost = this.pulse * this.params.reactivity * 0.45;
    let liveCount = 0;
    let changedCount = 0;

    for (let y = 0; y < n; y++) {
      const yUp = (y === 0 ? n - 1 : y - 1) * n;
      const yMid = y * n;
      const yDn = (y === n - 1 ? 0 : y + 1) * n;

      for (let x = 0; x < n; x++) {
        const xL = x === 0 ? n - 1 : x - 1;
        const xR = x === n - 1 ? 0 : x + 1;

        const i0 = yUp + xL;
        const i1 = yUp + x;
        const i2 = yUp + xR;
        const i3 = yMid + xL;
        const idx = yMid + x;
        const i4 = yMid + xR;
        const i5 = yDn + xL;
        const i6 = yDn + x;
        const i7 = yDn + xR;

        const a0 = alive[i0];
        const a1 = alive[i1];
        const a2 = alive[i2];
        const a3 = alive[i3];
        const a4 = alive[i4];
        const a5 = alive[i5];
        const a6 = alive[i6];
        const a7 = alive[i7];
        const neighbors = a0 + a1 + a2 + a3 + a4 + a5 + a6 + a7;

        const wasAlive = alive[idx];
        let isAlive =
          neighbors === 3 || (wasAlive === 1 && neighbors === 2) ? 1 : 0;

        if (isAlive !== wasAlive) {
          changedCount++;
        }

        // Track static ash & period-2 blinkers so they can gracefully dissolve.
        const unchanged =
          isAlive === wasAlive || isAlive === prev1[idx] ? 1 : 0;
        let still = unchanged ? Math.min(65535, stillness[idx] + 1) : 0;
        if (
          isAlive === 1 &&
          curation > 0.02 &&
          still > ashThreshold &&
          generation > protectedUntil[idx]
        ) {
          // Only dissolve stagnant debris if no immediate neighbor is freshly active.
          if (
            stillness[i0] > 4 &&
            stillness[i1] > 4 &&
            stillness[i2] > 4 &&
            stillness[i3] > 4 &&
            stillness[i4] > 4 &&
            stillness[i5] > 4 &&
            stillness[i6] > 4 &&
            stillness[i7] > 4
          ) {
            isAlive = 0;
            still = 0;
          }
        }

        prev2[idx] = prev1[idx];
        prev1[idx] = wasAlive;
        stillness[idx] = still;
        nextAlive[idx] = isAlive;

        if (isAlive) {
          liveCount++;
          if (wasAlive) {
            nextAge[idx] = age[idx] < 255 ? age[idx] + 1 : 255;
            nextHue[idx] = hueBuf[idx];
          } else {
            nextAge[idx] = 1;
            // Shortest-arc circular average of the 3 living parents' hues.
            let h0 = 0;
            let h1 = 0;
            let h2 = 0;
            let found = 0;
            if (a0) {
              h0 = hueBuf[i0];
              found = 1;
            }
            if (a1) {
              if (found === 0) h0 = hueBuf[i1];
              else if (found === 1) h1 = hueBuf[i1];
              else h2 = hueBuf[i1];
              found++;
            }
            if (a2) {
              if (found === 0) h0 = hueBuf[i2];
              else if (found === 1) h1 = hueBuf[i2];
              else h2 = hueBuf[i2];
              found++;
            }
            if (a3) {
              if (found === 0) h0 = hueBuf[i3];
              else if (found === 1) h1 = hueBuf[i3];
              else h2 = hueBuf[i3];
              found++;
            }
            if (a4) {
              if (found === 0) h0 = hueBuf[i4];
              else if (found === 1) h1 = hueBuf[i4];
              else h2 = hueBuf[i4];
              found++;
            }
            if (a5) {
              if (found === 0) h0 = hueBuf[i5];
              else if (found === 1) h1 = hueBuf[i5];
              else h2 = hueBuf[i5];
              found++;
            }
            if (a6) {
              if (found === 0) h0 = hueBuf[i6];
              else if (found === 1) h1 = hueBuf[i6];
              else h2 = hueBuf[i6];
              found++;
            }
            if (a7) {
              if (found === 0) h0 = hueBuf[i7];
              else if (found === 1) h1 = hueBuf[i7];
              else h2 = hueBuf[i7];
            }
            let dh1 = h1 - h0;
            if (dh1 > 0.5) dh1 -= 1;
            else if (dh1 < -0.5) dh1 += 1;
            let dh2 = h2 - h0;
            if (dh2 > 0.5) dh2 -= 1;
            else if (dh2 < -0.5) dh2 += 1;
            let h = h0 + (dh1 + dh2) * (1 / 3);
            if (h < 0) h += 1;
            else if (h >= 1) h -= 1;
            nextHue[idx] = h;
            energy[idx] = Math.min(1, Math.max(energy[idx], 0.32 + birthBoost));
          }
          trail[idx] = 1;
        } else {
          nextAge[idx] = 0;
          nextHue[idx] = hueBuf[idx];
        }
      }
    }

    // Swap double buffers without allocation.
    this.alive = nextAlive;
    this.nextAlive = alive;
    this.age = nextAge;
    this.nextAge = age;
    this.hueBuf = nextHue;
    this.nextHue = hueBuf;
    this.dirtyTexture = true;

    // Finger-on-the-scale director: keep the canvas vibrant with cool Conway shapes.
    if (curation <= 0.01) {
      this.pendingLowCue = false;
      this.pendingMidCue = false;
      this.pendingHighCue = false;
      return;
    }

    const total = n * n;
    const liveRatio = liveCount / total;
    const changeRatio = changedCount / total;

    // 1. Overcrowding relief: clear a clean central arena and stage a fresh hero centerpiece.
    const crowdLimit = 0.24 - curation * 0.07;
    if (liveRatio > crowdLimit) {
      this.clearArena(0.32);
      this.spawnHeroFormation(true);
      this.quietGenerations = 0;
      this.pendingLowCue = false;
      return;
    }

    // 2. Lull / extinction rescue: never let the visualizer fade into empty silence.
    if (changeRatio < 0.0055 || liveRatio < 0.012) {
      this.quietGenerations++;
    } else {
      this.quietGenerations = 0;
    }
    const quietLimit = Math.max(6, Math.round(28 - curation * 20));
    if (this.quietGenerations >= quietLimit) {
      this.spawnHeroFormation(false);
      this.spawnSpaceshipSquadron(0.85);
      this.quietGenerations = 0;
      return;
    }

    // 3. Musical & autonomous shape choreography.
    const heroCooldown = Math.max(14, Math.round(52 - curation * 32));
    const fleetCooldown = Math.max(12, Math.round(44 - curation * 26));
    const sparkleCooldown = Math.max(10, Math.round(38 - curation * 22));
    const autoCadence = Math.round(115 - curation * 72);

    if (this.pendingLowCue && generation - this.lastHeroGen >= heroCooldown) {
      this.spawnHeroFormation(true);
      this.pendingLowCue = false;
    } else if (
      this.pendingMidCue &&
      generation - this.lastFleetGen >= fleetCooldown
    ) {
      this.spawnSpaceshipSquadron(1);
      this.pendingMidCue = false;
    } else if (
      this.pendingHighCue &&
      generation - this.lastSparkleGen >= sparkleCooldown
    ) {
      this.spawnHighAccent(1);
      this.pendingHighCue = false;
    } else if (generation - this.lastHeroGen >= autoCadence) {
      if (this.random() < 0.68) {
        this.spawnHeroFormation(false);
      } else {
        this.spawnSpaceshipSquadron(0.85);
        this.lastHeroGen = generation;
      }
    }
  }

  private decayFields(dt: number) {
    if (dt <= 0) return;
    const count = this.size * this.size;
    const alive = this.alive;
    const trail = this.trail;
    const energy = this.energy;
    // Higher trail slider => slower phosphor fade.
    const trailRate = 0.7 + (1 - this.params.trails) * 6.5;
    const trailFactor = Math.exp(-dt * trailRate);
    const energyFactor = Math.exp(-dt * 4.5);
    let changed = false;

    for (let i = 0; i < count; i++) {
      if (alive[i]) {
        trail[i] = 1;
      } else if (trail[i] > 0.002) {
        trail[i] *= trailFactor;
        changed = true;
      } else if (trail[i] > 0) {
        trail[i] = 0;
        changed = true;
      }
      if (energy[i] > 0.002) {
        energy[i] *= energyFactor;
        changed = true;
      } else if (energy[i] > 0) {
        energy[i] = 0;
        changed = true;
      }
    }
    if (changed) this.dirtyTexture = true;
  }

  private syncTexture() {
    const count = this.size * this.size;
    const alive = this.alive;
    const age = this.age;
    const trail = this.trail;
    const hueBuf = this.hueBuf;
    const energy = this.energy;
    const out = this.texData;

    for (let i = 0, o = 0; i < count; i++, o += 4) {
      out[o] = alive[i] ? age[i] : 0;
      const t = trail[i];
      out[o + 1] = t >= 1 ? 255 : t <= 0 ? 0 : (t * 255 + 0.5) | 0;
      const h = hueBuf[i];
      out[o + 2] = ((h - Math.floor(h)) * 255 + 0.5) | 0;
      const e = energy[i];
      out[o + 3] = e >= 1 ? 255 : e <= 0 ? 0 : (e * 255 + 0.5) | 0;
    }
    this.stateTexture.needsUpdate = true;
    this.dirtyTexture = false;
  }

  protected override onReset() {
    this.pulse = 0;
    this.highPulse = 0;
    this.allocateGrid(this.params.cells);
    this.seedStage();
  }

  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    const p = this.params;
    if (
      p.cells !== this.appliedCells ||
      p.seed !== this.appliedSeed ||
      p.preset !== this.appliedPreset
    ) {
      this.appliedCells = p.cells;
      this.appliedSeed = p.seed;
      this.appliedPreset = p.preset;
      this.onReset();
    }

    const delta = Math.max(0, Math.min(dt, 0.25));
    const react = p.reactivity;
    const lowAttack = audio.lowAttack ?? 0;
    const midAttack = audio.midAttack ?? 0;
    const highAttack = audio.highAttack ?? 0;

    if (react > 0) {
      this.pulse = Math.max(
        this.pulse * Math.exp(-delta * 9),
        audio.beat,
        lowAttack,
        midAttack * 0.85,
        highAttack * 0.75,
      );
      this.highPulse = Math.max(
        this.highPulse * Math.exp(-delta * 11),
        highAttack,
        audio.treble * 0.45,
      );
      if (audio.kick || audio.beat > 0.72 || lowAttack > 0.55) {
        this.pendingLowCue = true;
      }
      if (midAttack > 0.5) {
        this.pendingMidCue = true;
      }
      if (highAttack > 0.5) {
        this.pendingHighCue = true;
      }
    } else {
      this.pulse = 0;
      this.highPulse = 0;
      this.pendingLowCue = false;
      this.pendingMidCue = false;
      this.pendingHighCue = false;
    }

    this.look.uHue.value = p.hue;
    this.look.uIntensity.value = p.intensity;
    this.look.uReactivity.value = react;
    this.look.uPulse.value = this.pulse;
    this.look.uHighPulse.value = this.highPulse;
    this.look.uTrails.value = p.trails;

    this.decayFields(delta);

    const drive =
      react > 0
        ? (audio.bass * 1.45 + audio.mid * 0.55 + this.pulse * 1.85) * react
        : 0;
    const rate = 11 * p.speed * (1 + drive);
    this.accumulator = Math.min(8, this.accumulator + delta * rate);
    const steps = Math.min(8, Math.floor(this.accumulator));
    if (steps > 0) {
      this.accumulator -= steps;
      for (let i = 0; i < steps; i++) {
        this.stepSimulation();
      }
    }
    if (this.dirtyTexture) {
      this.syncTexture();
    }
  }

  override render(renderer: T.WebGLRenderer, output: T.WebGLRenderTarget) {
    this.pass.render(renderer, output);
  }

  override dispose() {
    super.dispose();
    this.stateTexture?.dispose();
  }
}
