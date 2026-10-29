import type { AudioEngine } from "../audio/AudioEngine";
import type { VisualizerHost } from "./VisualizerHost";

export class VideoExporter {
  private cancelRecording: (() => void) | null = null;
  get active() {
    return this.cancelRecording !== null;
  }
  cancel() {
    this.cancelRecording?.();
  }

  async record(host: VisualizerHost, audio: AudioEngine): Promise<Blob> {
    if (this.active) throw new Error("An export is already running.");
    if (!audio.fileLoaded)
      throw new Error("Open an audio file before exporting.");
    if (typeof MediaRecorder === "undefined" || !host.canvas.captureStream)
      throw new Error(
        "Video export is unavailable in this browser. Try Chrome or Edge.",
      );
    const mimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/mp4",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType)
      throw new Error("This browser has no supported video encoder.");
    const video = host.canvas.captureStream(30);
    let capture: ReturnType<AudioEngine["beginExport"]> | undefined;
    let recorder: MediaRecorder | undefined;
    let canceled = false;
    let failure: Error | undefined;
    const stop = () => {
      if (recorder?.state === "recording") recorder.stop();
    };
    const hidden = () => {
      if (document.hidden) {
        failure = new Error(
          "Export interrupted because the tab was hidden. Keep this tab visible and try again.",
        );
        stop();
      }
    };
    try {
      host.exporting = true;
      host.clear();
      capture = audio.beginExport(stop);
      recorder = new MediaRecorder(
        new MediaStream([
          ...video.getVideoTracks(),
          ...capture.stream.getAudioTracks(),
        ]),
        { mimeType, videoBitsPerSecond: 8_000_000 },
      );
      const chunks: Blob[] = [];
      const finished = new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder!.onerror = () => {
          failure = new Error(
            "Video encoding failed. Try another browser or lower render quality.",
          );
          stop();
        };
        recorder!.onstop = () => {
          if (canceled) reject(new Error("Export canceled."));
          else if (failure) reject(failure);
          else if (!chunks.length)
            reject(new Error("The browser produced an empty video."));
          else resolve(new Blob(chunks, { type: recorder!.mimeType }));
        };
      });
      this.cancelRecording = () => {
        canceled = true;
        stop();
      };
      document.addEventListener("visibilitychange", hidden);
      host.canvas.addEventListener("webglcontextlost", this.cancelRecording);
      recorder.start(1000);
      await capture.ready;
      await audio.context!.resume();
      return await finished;
    } finally {
      document.removeEventListener("visibilitychange", hidden);
      if (this.cancelRecording)
        host.canvas.removeEventListener(
          "webglcontextlost",
          this.cancelRecording,
        );
      stop();
      capture?.restore();
      video.getTracks().forEach((track) => track.stop());
      this.cancelRecording = null;
      host.exporting = false;
      host.resize();
    }
  }
}
