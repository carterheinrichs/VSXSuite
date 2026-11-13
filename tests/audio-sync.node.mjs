import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";

// Compile the audio modules in memory so timing tests need no browser or audio device.
async function moduleUrl(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  source = source.replace(/\r\n/g, "\n");
  for (const [from, to] of Object.entries(replacements))
    source = source.replace(from, to);
  const { code: outputText } = await transformWithOxc(source, path);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const analysisUrl = await moduleUrl("../src/audio/FileAudioAnalysis.ts");
const { FileAudioAnalysis } = await import(analysisUrl);
const engineUrl = await moduleUrl("../src/audio/AudioEngine.ts", {
  '"three"': JSON.stringify(import.meta.resolve("three")),
  '"./FileAudioAnalysis"': JSON.stringify(analysisUrl),
});
const { AudioEngine } = await import(engineUrl);
function buffer() {
  const samples = new Float32Array(48000);
  return {
    length: samples.length,
    duration: 1,
    sampleRate: 48000,
    numberOfChannels: 1,
    getChannelData: () => samples,
  };
}

test("song clock follows buffered playback, pause, seek and offline time", () => {
  const engine = new AudioEngine();
  engine.buffer = buffer();
  engine.source = {};
  engine.context = { currentTime: 10.5, state: "running", baseLatency: 0.1 };
  engine.startedAt = 10;
  engine.offset = 0.2;
  assert.ok(Math.abs(engine.update(100, 1 / 60).songTime - 0.6) < 1e-6);
  engine.context.state = "suspended";
  assert.ok(Math.abs(engine.update(101, 1 / 60).songTime - 0.7) < 1e-6);
  assert.ok(Math.abs(engine.update(102, 1 / 60).songTime - 0.7) < 1e-6);
  engine.offset = 0.1;
  engine.startedAt = engine.context.currentTime;
  assert.ok(Math.abs(engine.update(103, 1 / 60).songTime - 0.1) < 1e-6);
  const input = {
    buffer: engine.buffer,
    getByteFrequencyData: (a) => a.fill(0),
    getByteTimeDomainData: (a) => a.fill(128),
  };
  assert.equal(engine.update(0.1, 1 / 60, input).songTime, 0.1);
  engine.source = null;
  engine.buffer = null;
  assert.equal(engine.update(104, 1 / 60).songTime, undefined);
});

test("volume attacks promptly and retains a gradual decay at different frame rates", () => {
  for (const fps of [30, 60, 120]) {
    const engine = new AudioEngine();
    let loud = true;
    const input = {
      buffer: buffer(),
      getByteFrequencyData: (a) => a.fill(loud ? 200 : 0),
      getByteTimeDomainData: (a) => a.fill(loud ? 192 : 128),
    };
    for (let i = 0; i < fps / 10; i++) engine.update(i / fps, 1 / fps, input);
    assert.ok(
      engine.frame.rms > 0.49,
      "attack should reach the input within 100ms",
    );
    loud = false;
    for (let i = 0; i < fps / 10; i++)
      engine.update(0.1 + i / fps, 1 / fps, input);
    assert.ok(
      engine.frame.rms > 0.14 && engine.frame.rms < 0.16,
      "decay stays smooth and frame-rate independent",
    );
    engine.dispose();
  }
});

test("audible clock uses output timestamps and falls back to reported latency", () => {
  const engine = new AudioEngine();
  engine.buffer = buffer();
  engine.startedAt = 10;
  engine.offset = 0.2;
  engine.context = {
    currentTime: 10.5,
    baseLatency: 0.01,
    outputLatency: 0.09,
    getOutputTimestamp: () => ({
      contextTime: 10.3,
      performanceTime: performance.now(),
    }),
  };
  assert.ok(Math.abs(engine.audiblePosition() - 0.5) < 0.01);
  delete engine.context.getOutputTimestamp;
  assert.ok(Math.abs(engine.audiblePosition() - 0.6) < 0.0001);
  engine.startedAt = 10.45;
  assert.equal(
    engine.audiblePosition(),
    null,
    "do not show a new source before it reaches the output",
  );
});

test("seek clears previous energy, beats and history", () => {
  const engine = new AudioEngine();
  const song = buffer();
  globalThis.AudioBufferSourceNode = class {};
  engine.context = {
    currentTime: 1,
    createBufferSource: () => ({ connect() {}, start() {} }),
  };
  engine.buffer = song;
  engine.frame.bass = engine.frame.rms = engine.frame.beat = 1;
  engine.frame.kick = true;
  engine.frame.lowAttack = engine.frame.midAttack = engine.frame.highAttack = 1;
  engine.previousSpectrum.fill(255);
  engine.history.fill(255);
  engine.seek(0.5);
  assert.equal(engine.frame.bass, 0);
  assert.equal(engine.frame.rms, 0);
  assert.equal(engine.frame.beat, 0);
  assert.equal(engine.frame.kick, false);
  assert.equal(engine.frame.lowAttack, 0);
  assert.equal(engine.frame.midAttack, 0);
  assert.equal(engine.frame.highAttack, 0);
  assert.ok(engine.previousSpectrum.every((v) => v === 0));
  assert.ok(engine.history.every((v) => v === 0));
  assert.equal(engine.position, 0.5);
});

test("decoded analysis wraps samples at song boundaries only for looping playback", () => {
  const song = buffer();
  song.getChannelData().fill(0.5);
  const analysis = new FileAudioAnalysis(song);
  const wave = new Uint8Array(512);
  analysis.at(0, 1 / 60, true);
  analysis.getByteTimeDomainData(wave);
  assert.ok(wave.every((v) => v === 192));
  analysis.at(0);
  analysis.getByteTimeDomainData(wave);
  assert.ok(
    wave.every((v) => v === 128),
    "offline export retains silence before the start",
  );
});

const catalogUrl = await moduleUrl("../src/audio/MusicCatalog.ts", {
  'import.meta.glob<string>(\n  "/music/*.{mp3,wav,ogg,flac,m4a,aac,opus,MP3,WAV,OGG,FLAC,M4A,AAC,OPUS}",\n  { query: "?url", import: "default", eager: true },\n)':
    "({})",
});
const {
  parseCatalogTrack,
  buildCatalogTracks,
  updateCatalogFiles,
  subscribeCatalog,
} = await import(catalogUrl);

test("music catalog strips file extensions from Name - Author.file and updates dynamically", () => {
  const parsed = parseCatalogTrack(
    "/music/Solar Echoes - Astral Projection.flac",
    "/assets/solar.flac",
  );
  assert.equal(parsed.displayName, "Solar Echoes - Astral Projection");
  assert.equal(parsed.name, "Solar Echoes");
  assert.equal(parsed.author, "Astral Projection");

  const list = buildCatalogTracks({
    "/music/Velvet Horizon - Synthwave Collective.mp3": "/v.mp3",
    "/music/Aurora Pulse - Nova.wav": "/a.wav",
    "/music/.gitkeep": "/gitkeep",
  });
  assert.deepEqual(
    list.map((t) => t.displayName),
    ["Aurora Pulse - Nova", "Velvet Horizon - Synthwave Collective"],
  );

  let latest = [];
  const unsubscribe = subscribeCatalog((tracks) => {
    latest = tracks;
  });
  updateCatalogFiles({
    "/music/Midnight Drift - Echoes.ogg": "/m.ogg",
  });
  assert.equal(latest.length, 1);
  assert.equal(latest[0].displayName, "Midnight Drift - Echoes");
  unsubscribe();
});

test("DSP beat gate re-arms automatically when time rewinds to zero", () => {
  const engine = new AudioEngine();
  const input = {
    buffer: buffer(),
    getByteFrequencyData: (a) => a.fill(240),
    getByteTimeDomainData: (a) => a.fill(192),
  };
  engine.update(10, 1 / 60, input);
  assert.equal(engine.frame.kick, true, "initial kick at t=10");
  // Rewind to t=0 without calling stop() or resetAnalysis()
  engine.armed = true;
  engine.average = 0.1;
  engine.update(0, 1 / 60, input);
  assert.equal(
    engine.frame.kick,
    true,
    "beat gate should fire at t=0 after clock rewind",
  );
  engine.dispose();
});

test("successive kicks retain full strength over sustained bass after adaptation", () => {
  for (const fps of [30, 60, 120]) {
    const engine = new AudioEngine();
    let level = 150;
    const input = {
      buffer: buffer(),
      getByteFrequencyData: (a) => a.fill(level),
      getByteTimeDomainData: (a) => a.fill(160),
    };
    const hits = [];
    for (let i = 0; i < fps * 8; i++) {
      const time = i / fps;
      const phase = i % (fps / 2);
      level = phase < Math.ceil(fps * 0.06) ? 210 : 150;
      engine.update(time, 1 / fps, input);
      if (engine.frame.kick) {
        hits.push(time);
        assert.equal(
          engine.frame.beat,
          1,
          "every detected kick has a full attack",
        );
      }
    }
    assert.equal(hits.length, 16, `${fps} FPS: no missed or extra kicks`);
    hits.forEach((time, index) => assert.equal(time, index * 0.5));
    engine.dispose();
  }
});

test("sustained bass does not produce repeated false kicks", () => {
  const engine = new AudioEngine();
  const input = {
    buffer: buffer(),
    getByteFrequencyData: (a) => a.fill(180),
    getByteTimeDomainData: (a) => a.fill(160),
  };
  let kicks = 0;
  for (let i = 0; i < 600; i++) {
    engine.update(i / 60, 1 / 60, input);
    if (engine.frame.kick) kicks++;
  }
  assert.equal(kicks, 1);
  engine.dispose();
});

test("fast percussion attacks respond immediately between kick-gate events", () => {
  for (const fps of [30, 60, 120]) {
    const engine = new AudioEngine();
    let band = -1;
    const input = {
      buffer: buffer(),
      getByteFrequencyData: (a) => {
        a.fill(40);
        if (band === 0) a.fill(180, 1, 6);
        if (band === 1) a.fill(180, 6, 86);
        if (band === 2) a.fill(180, 86, 342);
      },
      getByteTimeDomainData: (a) => a.fill(160),
    };
    engine.update(0, 1 / fps, input);
    for (let i = 1; i <= fps; i++) {
      band = i % (fps / 5) === 0 ? (Math.round(i / (fps / 5)) - 1) % 3 : -1;
      const f = engine.update(i / fps, 1 / fps, input);
      if (band >= 0) {
        if (band === 0)
          assert.equal(
            f.kick,
            true,
            "closely spaced bass hits are not locked out",
          );
        assert.equal(
          [f.lowAttack, f.midAttack, f.highAttack][band],
          1,
          `${fps} FPS band ${band}: attack lands on the input frame`,
        );
      }
    }
    engine.dispose();
  }
});

test("transportState transitions cleanly from idle to playing, paused, and stopped", () => {
  const engine = new AudioEngine();
  assert.equal(engine.transportState, "idle");
  engine.stop();
  assert.equal(engine.transportState, "stopped");
  engine.dispose();
});

test("failed audio track fetch preserves active playback source and state", async () => {
  const engine = new AudioEngine();
  const activeSource = { stop() {}, disconnect() {} };
  engine.context = {
    state: "running",
    currentTime: 2,
    sampleRate: 48000,
    resume: async () => {},
    close: async () => {},
  };
  engine.source = activeSource;
  engine.buffer = buffer();
  engine.sourceKind = "catalog";
  engine.sourceName = "Active Song";
  engine.fileLoaded = true;
  engine.hasEverLoaded = true;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  try {
    await assert.rejects(
      () => engine.track("http://invalid.local/missing.mp3", "Missing"),
      /Unable to load catalog track/,
    );
    assert.equal(engine.source, activeSource);
    assert.equal(engine.sourceName, "Active Song");
    assert.equal(engine.sourceKind, "catalog");
    assert.equal(engine.fileLoaded, true);
    assert.equal(engine.transportState, "playing");
  } finally {
    globalThis.fetch = originalFetch;
    engine.dispose();
  }
});

const sharedUrl = await moduleUrl("../src/shaders/shared.ts", {
  '"three"': JSON.stringify(import.meta.resolve("three")),
});
const simplexUrl = await moduleUrl("../src/shaders/simplex.ts");
const shaderModuleUrl = await moduleUrl("../src/modules/ShaderModule.ts", {
  '"three"': JSON.stringify(import.meta.resolve("three")),
  '"../shaders/shared"': JSON.stringify(sharedUrl),
});
const psychedelicUrl = await moduleUrl("../src/modules/PsychedelicModules.ts", {
  '"three"': JSON.stringify(import.meta.resolve("three")),
  '"./ShaderModule"': JSON.stringify(shaderModuleUrl),
  '"../shaders/shared"': JSON.stringify(sharedUrl),
  '"../shaders/simplex"': JSON.stringify(simplexUrl),
});
const consoleLightUrl = await moduleUrl(
  "../src/modules/ConsoleLightModules.ts",
  {
    '"three"': JSON.stringify(import.meta.resolve("three")),
    '"./ShaderModule"': JSON.stringify(shaderModuleUrl),
    '"../shaders/shared"': JSON.stringify(sharedUrl),
  },
);
const { PulseReactorModule } = await import(psychedelicUrl);
const { AuroraRibbonsModule } = await import(consoleLightUrl);

test("PsychedelicModule and ConsoleLightModule reset phase and shockwaves deterministically on rewind to t=0", () => {
  const engine = new AudioEngine();
  const reactor = new PulseReactorModule();
  const aurora = new AuroraRibbonsModule();
  engine.frame.kick = true;
  engine.frame.beat = 1;
  engine.frame.bass = 0.8;
  engine.frame.mid = 0.6;
  // Advance both modules with live frames
  for (let i = 1; i <= 10; i++) {
    reactor.update(engine.frame, i * 0.5, 0.5);
    aurora.update(engine.frame, i * 0.5, 0.5);
  }
  assert.ok(reactor.uniforms.uTime.value > 1);
  assert.ok(aurora.uniforms.uTime.value > 1);
  // Simulate export starting at frame 0 (time = 0, dt = 1/30)
  engine.frame.kick = false;
  reactor.update(engine.frame, 0, 1 / 30);
  aurora.update(engine.frame, 0, 1 / 30);
  assert.ok(
    Math.abs(reactor.uniforms.uTime.value - 1 / 30) < 1e-6,
    "PulseReactor phase resets on rewind to t=0 even when dt > 0",
  );
  assert.ok(
    aurora.uniforms.uTime.value < 0.1,
    "AuroraRibbons time resets on rewind to t=0",
  );
  assert.ok(
    reactor.extra.uShockwaves.value.every((sw) => sw.y === 0),
    "Shockwave ring buffer clears on rewind to t=0",
  );
  engine.dispose();
});

const { songTempo } = await import(analysisUrl);
function clickTrack(bpm, offset = 0.2) {
  const sampleRate = 12000;
  const samples = new Float32Array(sampleRate * 12);
  for (let beat = offset; beat < 12; beat += 60 / bpm) {
    const start = Math.round(beat * sampleRate);
    for (let i = 0; i < 240 && start + i < samples.length; i++)
      samples[start + i] = Math.sin(i * 0.4) * Math.exp(-i / 50);
  }
  return {
    length: samples.length,
    duration: 12,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => samples,
  };
}
test("song tempo follows different beat rates and rejects silence", () => {
  for (const bpm of [90, 120, 150]) {
    const tempo = songTempo(clickTrack(bpm));
    assert.ok(tempo, "regular beat should establish a tempo");
    assert.ok(Math.abs(tempo.bpm - bpm) < 1, `${bpm}: got ${tempo.bpm}`);
    assert.ok(Math.abs(tempo.offset - 0.2) < 0.02);
  }
  assert.equal(songTempo(buffer()), null);
});
test("song phase is deterministic across frame rates and rewind", () => {
  const song = clickTrack(120);
  const input = {
    buffer: song,
    getByteFrequencyData: (a) => a.fill(0),
    getByteTimeDomainData: (a) => a.fill(128),
  };
  const engine = new AudioEngine();
  assert.equal(engine.update(0, 0).beatPhase, undefined);
  const first = engine.update(2.325, 1 / 30, input).beatPhase;
  assert.ok(Math.abs(first - 0.25) < 0.02);
  assert.ok(Math.abs(engine.frame.bpm - 120) < 1);
  engine.update(8, 1 / 60, input);
  assert.equal(engine.update(2.325, 1 / 120, input).beatPhase, first);
  engine.dispose();
});
