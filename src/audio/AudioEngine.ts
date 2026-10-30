import * as T from "three";
import type { AudioFrameData } from "../core/types";
const WIDTH = 512,
  HISTORY = 128;
export class AudioEngine {
  readonly bytes = new Uint8Array(WIDTH * 2);
  readonly history = new Uint8Array(WIDTH * HISTORY);
  private readonly spectrum = this.bytes.subarray(0, WIDTH);
  private readonly waveform = this.bytes.subarray(WIDTH);
  readonly texture = new T.DataTexture(
    this.bytes,
    WIDTH,
    2,
    T.RedFormat,
    T.UnsignedByteType,
  );
  readonly historyTexture = new T.DataTexture(
    this.history,
    WIDTH,
    HISTORY,
    T.RedFormat,
    T.UnsignedByteType,
  );
  readonly frame: AudioFrameData = {
    subBass: 0,
    bass: 0,
    lowMid: 0,
    mid: 0,
    highMid: 0,
    treble: 0,
    rms: 0,
    centroid: 0,
    beat: 0,
    kick: false,
    uAudioTexture: this.texture,
    uAudioHistoryTexture: this.historyTexture,
  };
  context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private output: GainNode | null = null;
  private source: AudioBufferSourceNode | MediaStreamAudioSourceNode | null =
    null;
  private stream: MediaStream | null = null;
  private armed = true;
  private average = 0.1;
  private lastBeat = -1;
  private generation = 0;
  private buffer: AudioBuffer | null = null;
  private startedAt = 0;
  private offset = 0;
  sourceName = "No audio";
  fileLoaded = false;
  beginExport() {
    if (!this.buffer || !this.context || !this.fileLoaded)
      throw new Error("Open an audio file before exporting.");
    const buffer = this.buffer;
    const position = this.position;
    const paused = !this.playing;
    const ready = this.context.suspend();
    return {
      buffer,
      ready,
      restore: () => {
        if (this.context?.state === "closed") return;
        this.seek(position);
        if (!paused) void this.context!.resume();
      },
    };
  }
  get hasSource() {
    return this.source !== null;
  }
  get playing() {
    return this.hasSource && this.context?.state === "running";
  }
  get duration() {
    return this.buffer?.duration ?? 0;
  }
  get position() {
    if (!this.source || !this.context) return 0;
    const elapsed = this.offset + this.context.currentTime - this.startedAt;
    return this.duration ? elapsed % this.duration : elapsed;
  }
  // Suspending the audio clock preserves sample-accurate playback position.
  async togglePlayback() {
    if (!this.hasSource) {
      await this.synth();
      return;
    }
    if (this.playing) await this.context!.suspend();
    else await this.context!.resume();
  }
  seek(seconds: number) {
    if (!this.buffer || !this.context || !Number.isFinite(seconds)) return;
    const position = Math.max(
      0,
      Math.min(seconds, this.buffer.duration - 0.001),
    );
    if (this.source instanceof AudioBufferSourceNode) this.source.stop();
    this.source?.disconnect();
    this.startBuffer(this.buffer, position);
  }
  private startBuffer(buffer: AudioBuffer, offset = 0) {
    const source = this.context!.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.analyser!);
    this.buffer = buffer;
    this.offset = offset;
    this.startedAt = this.context!.currentTime;
    this.source = source;
    source.start(0, offset);
  }
  constructor() {
    for (const t of [this.texture, this.historyTexture]) {
      t.minFilter = T.LinearFilter;
      t.magFilter = T.LinearFilter;
      t.generateMipmaps = false;
      t.unpackAlignment = 1;
    }
    this.waveform.fill(128);
  }
  private async ready() {
    if (!this.context) {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.76;
      this.output = this.context.createGain();
      this.output.gain.value = 0.65;
      this.analyser.connect(this.output);
      this.output.connect(this.context.destination);
    }
    await this.context.resume();
  }
  stop() {
    this.fileLoaded = false;
    this.generation++;
    this.armed = true;
    this.average = 0.1;
    this.lastBeat = -1;
    if (this.source) {
      if (this.source instanceof AudioBufferSourceNode) {
        try {
          this.source.stop();
        } catch {
          /* already ended */
        }
      }
      this.source.disconnect();
      this.source = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.buffer = null;
    this.offset = 0;
    this.startedAt = 0;
    this.sourceName = "No audio";
    this.bytes.fill(0);
    this.waveform.fill(128);
    this.history.fill(0);
    this.texture.needsUpdate = true;
    this.historyTexture.needsUpdate = true;
  }
  async file(file: File) {
    await this.ready();
    this.stop();
    const token = this.generation;
    const buffer = await this.context!.decodeAudioData(
      await file.arrayBuffer(),
    );
    if (token !== this.generation) return;
    this.output!.gain.value = 0.65;
    this.startBuffer(buffer);
    this.sourceName = file.name;
    this.fileLoaded = true;
  }
  async input(system = false) {
    await this.ready();
    this.stop();
    const token = this.generation;
    const stream = system
      ? await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
      : await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
    if (token !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(
        "No shared audio. Enable audio sharing in the source picker.",
      );
    }
    this.stream = stream;
    this.source = this.context!.createMediaStreamSource(stream);
    this.source.connect(this.analyser!);
    this.startedAt = this.context!.currentTime;
    this.output!.gain.value = 0;
    this.sourceName = system ? "System audio" : "Microphone";
  }
  async synth() {
    await this.ready();
    this.stop();
    const c = this.context!;
    const rate = c.sampleRate;
    const buffer = c.createBuffer(1, rate * 8, rate);
    const data = buffer.getChannelData(0);
    let phase = 0;
    let seed = 42;
    // Render an eight-second seamless beat once; playback needs no JS scheduler.
    for (let i = 0; i < data.length; i++) {
      const t = i / rate,
        b = t % 0.5;
      phase += (2 * Math.PI * (46 + 105 * Math.exp(-b * 35))) / rate;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      const hat = Math.exp(-(t % 0.25) * 85) * noise * 0.13;
      const snare =
        Math.floor(t / 0.5) % 2 ? Math.exp(-b * 23) * noise * 0.22 : 0;
      const note = [55, 65.406, 73.416, 49][Math.floor(t / 2) % 4];
      const pad =
        (Math.sin(t * note * 2 * Math.PI) +
          0.4 * Math.sin(t * note * 4 * Math.PI)) *
        0.08;
      data[i] = Math.tanh(
        Math.sin(phase) * Math.exp(-b * 12) * 0.8 + hat + snare + pad,
      );
    }
    this.output!.gain.value = 0.65;
    this.startBuffer(buffer);
    this.sourceName = "Procedural / 120 BPM";
  }
  update(
    time: number,
    dt: number,
    offline?: {
      getByteFrequencyData(data: Uint8Array): void;
      getByteTimeDomainData(data: Uint8Array): void;
      buffer: AudioBuffer;
    },
  ) {
    const f = this.frame;
    if (offline) {
      offline.getByteFrequencyData(this.spectrum);
      offline.getByteTimeDomainData(this.waveform);
    } else if (this.context?.state === "suspended") {
      this.spectrum.fill(0);
      this.waveform.fill(128);
    } else {
      this.analyser?.getByteFrequencyData(this.spectrum);
      this.analyser?.getByteTimeDomainData(this.waveform);
    }
    this.history.copyWithin(WIDTH, 0, WIDTH * (HISTORY - 1));
    this.history.set(this.spectrum, 0);
    // historyTexture is marked dirty on demand by modules that sample it (NeonFeedbackModule).
    this.texture.needsUpdate = true;
    const hz =
      (offline?.buffer.sampleRate ?? this.context?.sampleRate ?? 48000) / 1024;
    const smoothing = 1 - Math.exp(-dt * 12);
    let energy = 0,
      weighted = 0,
      rms = 0;
    for (let i = 0; i < WIDTH; i++) {
      const v = this.spectrum[i] / 255;
      energy += v;
      weighted += v * i;
      const wave = (this.waveform[i] - 128) / 128;
      rms += wave * wave;
    }
    f.rms += (Math.sqrt(rms / WIDTH) - f.rms) * smoothing;
    f.centroid = energy > 0 ? weighted / (energy * (WIDTH - 1)) : 0;
    f.subBass += (this.band(20, 60, hz) - f.subBass) * smoothing;
    f.bass += (this.band(60, 250, hz) - f.bass) * smoothing;
    f.lowMid += (this.band(250, 500, hz) - f.lowMid) * smoothing;
    f.mid += (this.band(500, 2000, hz) - f.mid) * smoothing;
    f.highMid += (this.band(2000, 6000, hz) - f.highMid) * smoothing;
    f.treble += (this.band(6000, 20000, hz) - f.treble) * smoothing;
    const low = this.band(20, 180, hz);
    f.kick =
      this.armed &&
      low > Math.max(0.15, this.average * 1.35) &&
      time - this.lastBeat > 0.24;
    if (f.kick) {
      this.armed = false;
      this.lastBeat = time;
      f.beat = 1;
    } else f.beat *= Math.exp(-dt * 7);
    if (low < Math.max(0.12, this.average * 1.1)) this.armed = true;
    this.average += (low - this.average) * (1 - Math.exp(-dt * 2));
    return f;
  }
  private band(lo: number, hi: number, hz: number) {
    const start = Math.max(0, Math.floor(lo / hz)),
      end = Math.min(WIDTH, Math.ceil(hi / hz));
    let sum = 0;
    for (let i = start; i < end; i++) sum += this.spectrum[i];
    return sum / (Math.max(1, end - start) * 255);
  }
  dispose() {
    this.stop();
    void this.context?.close();
    this.texture.dispose();
    this.historyTexture.dispose();
  }
}
