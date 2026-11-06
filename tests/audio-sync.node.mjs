import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";

// Compile the audio modules in memory so timing tests need no browser or audio device.
async function moduleUrl(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
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
  engine.history.fill(255);
  engine.seek(0.5);
  assert.equal(engine.frame.bass, 0);
  assert.equal(engine.frame.rms, 0);
  assert.equal(engine.frame.beat, 0);
  assert.equal(engine.frame.kick, false);
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
