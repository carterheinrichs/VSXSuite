import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeVideo,
  canEncodeAudio,
} from "mediabunny";
import { AudioEngine } from "../audio/AudioEngine";
import { FileAudioAnalysis } from "../audio/FileAudioAnalysis";
import type { VisualizerHost } from "./VisualizerHost";

export const EXPORT_PRESETS = {
  "1080p": { width: 1920, height: 1080, bitrate: 20_000_000 },
  "1440p": { width: 2560, height: 1440, bitrate: 32_000_000 },
  "4k": { width: 3840, height: 2160, bitrate: 60_000_000 },
};
export interface ExportProgress {
  frame: number;
  total: number;
  seconds: number;
  phase: string;
}
export class VideoExporter {
  private controller: AbortController | null = null;
  get active() {
    return this.controller !== null;
  }
  cancel() {
    this.controller?.abort();
  }

  async record(
    host: VisualizerHost,
    audio: AudioEngine,
    preset: keyof typeof EXPORT_PRESETS = "1440p",
    fps: 30 | 60 = 30,
    onProgress: (progress: ExportProgress) => void = () => {},
  ): Promise<Blob> {
    if (this.active) throw new Error("An export is already running.");
    if (!audio.fileLoaded)
      throw new Error("Open an audio file before exporting.");
    if (
      typeof VideoEncoder === "undefined" ||
      typeof AudioEncoder === "undefined"
    )
      throw new Error(
        "High-quality export requires WebCodecs. Open this app in a current Chrome or Edge browser over HTTPS or localhost.",
      );
    const controller = new AbortController();
    this.controller = controller;
    const check = () => {
      if (controller.signal.aborted) throw new Error("Export canceled.");
    };
    const { width, height, bitrate } = EXPORT_PRESETS[preset];
    const quality = new Quality({
      bitrate: bitrate * (fps / 30),
      bitrateMode: "variable",
    });
    let output: Output<WebMOutputFormat, BufferTarget> | undefined;
    let capture: ReturnType<AudioEngine["beginExport"]> | undefined;
    const analysisAudio = new AudioEngine();
    let renderStarted = false;
    const contextLost = () => controller.abort();
    host.canvas.addEventListener("webglcontextlost", contextLost);
    try {
      // Probe the actual export size; never silently fall back to preview resolution.
      const codec = (await canEncodeVideo("vp9", {
        width,
        height,
        quality,
        frameRate: fps,
      }))
        ? "vp9"
        : (await canEncodeVideo("vp8", {
              width,
              height,
              quality,
              frameRate: fps,
            }))
          ? "vp8"
          : null;
      check();
      if (!codec || !(await canEncodeAudio("opus")))
        throw new Error(
          "This browser cannot encode the selected quality. Try 1080p or a current Chrome/Edge browser.",
        );
      check();
      capture = audio.beginExport();
      await capture.ready;
      check();
      renderStarted = true;
      host.beginOfflineExport(width, height);
      const analysis = new FileAudioAnalysis(capture.buffer);
      const target = new BufferTarget();
      output = new Output({ format: new WebMOutputFormat(), target });
      const video = new CanvasSource(host.canvas, {
        codec,
        quality,
        latencyMode: "quality",
        keyFrameInterval: 2,
      });
      const soundtrack = new AudioBufferSource({
        codec: "opus",
        quality: new Quality({ bitrate: 320_000 }),
      });
      output.addVideoTrack(video, { frameRate: fps });
      output.addAudioTrack(soundtrack);
      await output.start();
      const total = Math.ceil(capture.buffer.duration * fps);
      // Audio is encoded directly from PCM, independent of real-time playback.
      onProgress({ frame: 0, total, seconds: 0, phase: "Encoding music" });
      await soundtrack.add(capture.buffer);
      soundtrack.close();
      check();
      let lastYield = performance.now();
      for (let frame = 0; frame < total; frame++) {
        check();
        const time = frame / fps;
        analysis.at(time);
        const data = analysisAudio.update(time, 1 / fps, analysis);
        host.renderFrame(data, time, 1 / fps);
        // Capture immediately after drawing: WebGL's drawing buffer need not be preserved.
        await video.add(
          time,
          Math.min(1 / fps, capture.buffer.duration - time),
        );
        onProgress({
          frame: frame + 1,
          total,
          seconds: Math.min(capture.buffer.duration, (frame + 1) / fps),
          phase: "Rendering",
        });
        // Allow cancel, repaint and status updates even with a fast software encoder.
        if (performance.now() - lastYield > 50) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          lastYield = performance.now();
        }
      }
      video.close();
      check();
      onProgress({
        frame: total,
        total,
        seconds: capture.buffer.duration,
        phase: "Finalizing video",
      });
      await output.finalize();
      check();
      return new Blob([target.buffer!], { type: "video/webm" });
    } finally {
      try {
        if (
          output &&
          output.state !== "finalized" &&
          output.state !== "canceled"
        )
          await output.cancel();
      } finally {
        host.canvas.removeEventListener("webglcontextlost", contextLost);
        analysisAudio.dispose();
        try {
          capture?.restore();
        } finally {
          try {
            if (renderStarted) host.endOfflineExport();
          } finally {
            this.controller = null;
          }
        }
      }
    }
  }
}
