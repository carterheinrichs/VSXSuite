import * as T from "three";
import { FileAudioAnalysis, songTempo } from "./FileAudioAnalysis";
import type { AudioFrameData } from "../core/types";
const WIDTH = 512,
  HISTORY = 128;
function follow(
  current: number,
  target: number,
  attack: number,
  release: number,
) {
  return current + (target - current) * (target > current ? attack : release);
}
export type AudioSourceKind =
  "none" | "file" | "catalog" | "synth" | "mic" | "system";
export type AudioTransportState =
  "idle" | "connecting" | "playing" | "paused" | "live" | "stopped";

export class AudioEngine {
  readonly bytes = new Uint8Array(WIDTH * 2);
  readonly history = new Uint8Array(WIDTH * HISTORY);
  private readonly spectrum = this.bytes.subarray(0, WIDTH);
  private readonly waveform = this.bytes.subarray(WIDTH);
  private readonly previousSpectrum = new Uint8Array(WIDTH);
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
    lowAttack: 0,
    midAttack: 0,
    highAttack: 0,
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
  private lowEnvelope = 0;
  private lastBeat = -1;
  private livePeriod = 0;
  private generation = 0;
  private buffer: AudioBuffer | null = null;
  private fileAnalysis: FileAudioAnalysis | null = null;
  private startedAt = 0;
  private offset = 0;
  private hasEverLoaded = false;
  sourceKind: AudioSourceKind = "none";
  sourceName = "No audio";
  fileLoaded = false;
  onStateChange: (() => void) | null = null;
  get transportState(): AudioTransportState {
    if (!this.hasSource) return this.hasEverLoaded ? "stopped" : "idle";
    if (this.sourceKind === "mic" || this.sourceKind === "system") {
      return this.context?.state === "running" ? "live" : "paused";
    }
    return this.playing ? "playing" : "paused";
  }
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
    this.onStateChange?.();
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
    this.resetAnalysis();
    this.fileAnalysis = new FileAudioAnalysis(buffer);
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
      this.analyser.smoothingTimeConstant = 0.2;
      this.output = this.context.createGain();
      this.output.gain.value = 0.65;
      this.analyser.connect(this.output);
      this.output.connect(this.context.destination);
    }
    await this.context.resume();
  }
  private releaseActiveSource() {
    this.resetAnalysis();
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
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
    this.buffer = null;
    this.fileAnalysis = null;
    this.offset = 0;
    this.startedAt = 0;
  }
  stop() {
    this.hasEverLoaded = true;
    this.fileLoaded = false;
    this.sourceKind = "none";
    this.generation++;
    this.releaseActiveSource();
    this.sourceName = "No audio";
    this.onStateChange?.();
  }
  private resetAnalysis() {
    this.armed = true;
    this.average = 0.1;
    this.lowEnvelope = 0;
    this.lastBeat = -1;
    this.livePeriod = 0;
    const f = this.frame;
    f.subBass = f.bass = f.lowMid = f.mid = f.highMid = f.treble = 0;
    f.rms = f.centroid = f.beat = 0;
    f.kick = false;
    f.lowAttack = f.midAttack = f.highAttack = 0;
    this.previousSpectrum.fill(0);
    f.bpm = f.beatPhase = undefined;
    f.songTime = undefined;
    this.bytes.fill(0);
    this.waveform.fill(128);
    this.history.fill(0);
    this.texture.needsUpdate = true;
    this.historyTexture.needsUpdate = true;
  }
  // Map the device's audible clock to the song, rather than the render-ahead clock.
  private audiblePosition() {
    const c = this.context!;
    let clock = c.currentTime - (c.baseLatency || 0) - (c.outputLatency || 0);
    const stamp = c.getOutputTimestamp?.();
    if (
      stamp &&
      (stamp.contextTime ?? 0) > 0 &&
      (stamp.performanceTime ?? 0) > 0
    ) {
      clock =
        stamp.contextTime! +
        (performance.now() - stamp.performanceTime!) / 1000;
    }
    clock = Math.min(c.currentTime, clock);
    if (clock < this.startedAt) return null;
    return (this.offset + clock - this.startedAt) % this.duration;
  }
  async file(file: File) {
    const token = ++this.generation;
    await this.ready();
    const bytes = await file.arrayBuffer();
    if (token !== this.generation) return;
    const buffer = await this.context!.decodeAudioData(bytes);
    if (token !== this.generation) return;
    await this.context!.resume();
    this.releaseActiveSource();
    this.output!.gain.value = 0.65;
    this.startBuffer(buffer);
    this.hasEverLoaded = true;
    this.sourceKind = "file";
    this.sourceName = file.name;
    this.fileLoaded = true;
    this.onStateChange?.();
  }
  async track(url: string, name: string) {
    const token = ++this.generation;
    await this.ready();
    const response = await fetch(url);
    if (!response.ok) throw new Error("Unable to load catalog track.");
    const bytes = await response.arrayBuffer();
    if (token !== this.generation) return;
    const buffer = await this.context!.decodeAudioData(bytes);
    if (token !== this.generation) return;
    await this.context!.resume();
    this.releaseActiveSource();
    this.output!.gain.value = 0.65;
    this.startBuffer(buffer);
    this.hasEverLoaded = true;
    this.sourceKind = "catalog";
    this.sourceName = name;
    this.fileLoaded = true;
    this.onStateChange?.();
  }
  async input(system = false) {
    const token = ++this.generation;
    await this.ready();
    if (
      system &&
      (!navigator.mediaDevices ||
        typeof navigator.mediaDevices.getDisplayMedia !== "function")
    ) {
      throw new Error(
        "System audio sharing is not supported on this device or mobile browser. Use Microphone or Open Audio.",
      );
    }
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
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(
        "No shared audio. Enable audio sharing in the source picker.",
      );
    }
    await this.context!.resume();
    this.releaseActiveSource();
    this.fileLoaded = false;
    this.hasEverLoaded = true;
    this.sourceKind = system ? "system" : "mic";
    this.stream = stream;
    for (const track of audioTracks) {
      track.onended = () => {
        if (this.stream === stream) this.stop();
      };
    }
    this.source = this.context!.createMediaStreamSource(stream);
    this.source.connect(this.analyser!);
    this.startedAt = this.context!.currentTime;
    this.output!.gain.value = 0;
    this.sourceName = system ? "System audio" : "Microphone";
    this.onStateChange?.();
  }
  async synth() {
    const token = ++this.generation;
    await this.ready();
    if (token !== this.generation) return;
    this.releaseActiveSource();
    this.fileLoaded = false;
    this.hasEverLoaded = true;
    this.sourceKind = "synth";
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
    this.onStateChange?.();
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
    if (time < this.lastBeat) {
      this.lastBeat = -1;
      this.livePeriod = 0;
      this.armed = true;
      this.lowEnvelope = 0;
      this.previousSpectrum.fill(0);
      this.frame.lowAttack = this.frame.midAttack = this.frame.highAttack = 0;
    }
    const f = this.frame;
    if (offline) {
      offline.getByteFrequencyData(this.spectrum);
      offline.getByteTimeDomainData(this.waveform);
    } else if (this.context?.state === "suspended") {
      this.spectrum.fill(0);
      this.waveform.fill(128);
    } else if (this.fileAnalysis && this.context && this.source) {
      const position = this.audiblePosition();
      if (position === null) {
        this.spectrum.fill(0);
        this.waveform.fill(128);
      } else {
        // Center the FFT on the audible sample; decoded files allow lookahead.
        this.fileAnalysis.at(
          position + 512 / this.context.sampleRate,
          dt,
          true,
        );
        this.fileAnalysis.getByteFrequencyData(this.spectrum);
        this.fileAnalysis.getByteTimeDomainData(this.waveform);
      }
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
    const attack = 1 - Math.exp(-dt * 60);
    const release = 1 - Math.exp(-dt * 12);
    let energy = 0,
      weighted = 0,
      rms = 0,
      lowFlux = 0,
      midFlux = 0,
      highFlux = 0,
      lowBins = 0,
      midBins = 0,
      highBins = 0;
    for (let i = 0; i < WIDTH; i++) {
      const v = this.spectrum[i] / 255;
      // Positive spectral change responds on this frame, without waiting for
      // the kick gate or the smoothed volume to reach a threshold.
      const rise = Math.max(0, v - this.previousSpectrum[i] / 255);
      const frequency = i * hz;
      if (frequency >= 20 && frequency < 250) {
        lowFlux += rise;
        lowBins++;
      } else if (frequency >= 250 && frequency < 4000) {
        midFlux += rise;
        midBins++;
      } else if (frequency >= 4000 && frequency < 16000) {
        highFlux += rise;
        highBins++;
      }
      this.previousSpectrum[i] = this.spectrum[i];
      energy += v;
      weighted += v * i;
      const wave = (this.waveform[i] - 128) / 128;
      rms += wave * wave;
    }
    const decay = Math.exp(-dt * 18);
    f.lowAttack = Math.max(
      (f.lowAttack ?? 0) * decay,
      Math.min(1, (lowFlux / Math.max(1, lowBins)) * 8),
    );
    f.midAttack = Math.max(
      (f.midAttack ?? 0) * decay,
      Math.min(1, (midFlux / Math.max(1, midBins)) * 8),
    );
    f.highAttack = Math.max(
      (f.highAttack ?? 0) * decay,
      Math.min(1, (highFlux / Math.max(1, highBins)) * 8),
    );
    f.rms = follow(f.rms, Math.sqrt(rms / WIDTH), attack, release);
    f.centroid = energy > 0 ? weighted / (energy * (WIDTH - 1)) : 0;
    f.subBass = follow(f.subBass, this.band(20, 60, hz), attack, release);
    f.bass = follow(f.bass, this.band(60, 250, hz), attack, release);
    f.lowMid = follow(f.lowMid, this.band(250, 500, hz), attack, release);
    f.mid = follow(f.mid, this.band(500, 2000, hz), attack, release);
    f.highMid = follow(f.highMid, this.band(2000, 6000, hz), attack, release);
    f.treble = follow(f.treble, this.band(6000, 20000, hz), attack, release);
    const low = this.band(20, 180, hz);
    // A new kick can rise above a sustained bass bed without ever crossing
    // the old gate's release threshold. Detect that local attack as well as
    // isolated peaks above the long-term average.
    const onset =
      low > Math.max(0.15, this.lowEnvelope + 0.025) &&
      low > this.lowEnvelope * 1.06;
    f.kick =
      ((this.armed && low > Math.max(0.15, this.average * 1.35)) || onset) &&
      time - this.lastBeat > 0.12;
    if (f.kick) {
      const interval = time - this.lastBeat;
      if (this.lastBeat >= 0 && interval >= 1 / 3 && interval <= 1) {
        this.livePeriod = this.livePeriod
          ? this.livePeriod * 0.8 + interval * 0.2
          : interval;
      }
      this.armed = false;
      this.lastBeat = time;
      f.beat = 1;
    } else f.beat *= Math.exp(-dt * 7);
    if (low < Math.max(0.12, this.average * 1.1)) this.armed = true;
    this.average += (low - this.average) * (1 - Math.exp(-dt * 2));
    this.lowEnvelope += (low - this.lowEnvelope) * (1 - Math.exp(-dt * 25));
    const buffer = offline?.buffer ?? this.buffer;
    const tempo = buffer ? songTempo(buffer) : null;
    const position = offline
      ? time
      : this.context && this.source && buffer
        ? this.context.state === "suspended"
          ? this.position
          : this.audiblePosition()
        : null;
    f.songTime =
      buffer && (offline || this.source) ? (position ?? 0) : undefined;
    f.bpm = f.beatPhase = undefined;
    if (tempo && position !== null) {
      f.bpm = tempo.bpm;
      f.beatPhase =
        (((((position - tempo.offset) * tempo.bpm) / 60) % 1) + 1) % 1;
    } else if (
      !buffer &&
      this.source &&
      this.livePeriod &&
      time - this.lastBeat < 3
    ) {
      f.bpm = 60 / this.livePeriod;
      f.beatPhase = ((time - this.lastBeat) / this.livePeriod) % 1;
    }
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
