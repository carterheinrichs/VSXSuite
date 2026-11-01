import { Pane } from "tweakpane";
import type { VisualizerHost } from "../core/VisualizerHost";
import type { AudioEngine } from "../audio/AudioEngine";
import type { IVisualModule } from "../core/types";
import { VideoExporter, type EXPORT_PRESETS } from "../core/VideoExporter";
export class ViszSuiteUI {
  private readonly pane: Pane;
  private readonly abort = new AbortController();
  private dragDepth = 0;
  private scrubbing = false;
  private readonly exporter = new VideoExporter();
  private downloadURL = "";
  private readonly play = document.querySelector<HTMLButtonElement>("#play")!;
  private readonly seek = document.querySelector<HTMLInputElement>("#seek")!;
  private readonly elapsed = document.querySelector<HTMLElement>("#elapsed")!;
  private readonly duration = document.querySelector<HTMLElement>("#duration")!;
  constructor(
    private readonly host: VisualizerHost,
    private readonly audio: AudioEngine,
  ) {
    this.pane = new Pane({
      container: document.querySelector("#rack")!,
      title: "CONTROL / RACK",
    });
    const visual = this.pane.addFolder({ title: "01  VISUAL ENGINE" });
    const sceneFolders = new Map<string, ReturnType<Pane["addFolder"]>>();
    const grid = document.querySelector<HTMLElement>("#scene-grid")!;
    const search = document.querySelector<HTMLInputElement>("#scene-search")!;
    let category = "All";
    const categoryFor = (index: number) =>
      index >= 16
        ? "Classic"
        : [3, 4, 5, 9, 10, 13, 14].includes(index)
          ? "Geometric"
          : "Atmospheric";
    const renderLibrary = () => {
      grid.replaceChildren();
      host.modules.forEach((module, index) => {
        if (
          (category !== "All" && categoryFor(index) !== category) ||
          !module.name.toLowerCase().includes(search.value.toLowerCase())
        )
          return;
        const button = document.createElement("button");
        button.className = "scene-card";
        button.dataset.scene = module.id;
        button.style.setProperty("--hue", String((index * 39 + 265) % 360));
        button.setAttribute(
          "aria-pressed",
          String(host.settings.scene === module.id),
        );
        const art = document.createElement("span");
        art.className = "scene-art art-" + (index % 4);
        const name = document.createElement("strong");
        name.textContent = module.name;
        const tag = document.createElement("small");
        tag.textContent = categoryFor(index);
        button.append(art, name, tag);
        button.addEventListener(
          "click",
          () => {
            if (this.exporter.active) return;
            host.select(module.id);
            for (const [id, folder] of sceneFolders)
              folder.hidden = id !== module.id;
            document.querySelector("#scene-title")!.textContent = module.name;
            renderLibrary();
          },
          { signal: this.abort.signal },
        );
        grid.append(button);
      });
      if (!grid.childElementCount)
        grid.textContent = "No visualizers match your search.";
    };
    search.addEventListener("input", renderLibrary, {
      signal: this.abort.signal,
    });
    document
      .querySelectorAll<HTMLButtonElement>("[data-category]")
      .forEach((button) =>
        button.addEventListener(
          "click",
          () => {
            category = button.dataset.category!;
            document
              .querySelectorAll("[data-category]")
              .forEach((item) =>
                item.classList.toggle("active", item === button),
              );
            renderLibrary();
          },
          { signal: this.abort.signal },
        ),
      );
    renderLibrary();
    for (const name of ["export"]) {
      const dialog = document.querySelector<HTMLDialogElement>(
        "#" + name + "-dialog",
      )!;
      document.querySelector("#" + name + "-open")!.addEventListener(
        "click",
        () => {
          dialog.showModal();
          if (name === "about") history.replaceState(null, "", "#about");
        },
        { signal: this.abort.signal },
      );
      dialog.querySelector("[data-close]")!.addEventListener(
        "click",
        () => {
          dialog.close();
          if (name === "about")
            history.replaceState(null, "", location.pathname + location.search);
        },
        { signal: this.abort.signal },
      );
    }
    visual.addBinding(host.settings, "overlay", { label: "Neon overlay" });
    visual.addBinding(host.settings, "postFX", { label: "Master FX" });
    visual
      .addBinding(host.settings, "autoQuality", { label: "Adaptive quality" })
      .on("change", () => host.resize());
    visual
      .addBinding(host.settings, "quality", {
        label: "Render scale",
        min: 0.35,
        max: 1,
        step: 0.05,
      })
      .on("change", () => host.resize());
    visual
      .addButton({ title: "Clear feedback" })
      .on("click", () => host.clear());
    for (const module of [...host.modules, host.post] as IVisualModule[]) {
      const folder = this.pane.addFolder({
        title: module.name.toUpperCase(),
        expanded: false,
      });
      if (module !== host.post) {
        folder.hidden = module.id !== host.settings.scene;
        sceneFolders.set(module.id, folder);
      }
      for (const key of Object.keys(module.params)) {
        const value = module.params[key];
        if (typeof value === "boolean") folder.addBinding(module.params, key);
        else
          folder.addBinding(module.params, key, {
            min: key === "symmetry" ? 2 : key === "detail" ? 32 : 0,
            max:
              key === "symmetry"
                ? 12
                : key === "detail"
                  ? 111
                  : key === "light"
                    ? 40
                    : key === "persistence"
                      ? 0.995
                      : key === "roughness"
                        ? 1
                        : key === "hue"
                          ? 1
                          : 3,
            step: key === "symmetry" || key === "detail" ? 1 : 0.005,
          });
      }
    }
    const sources = this.pane.addFolder({
      title: "02  AUDIO SOURCE",
      expanded: false,
    });
    sources
      .addButton({ title: "Procedural beat" })
      .on("click", () => void this.run(() => audio.synth()));
    sources
      .addButton({ title: "Microphone" })
      .on("click", () => void this.run(() => audio.input()));
    sources
      .addButton({ title: "Share system / tab audio" })
      .on("click", () => void this.run(() => audio.input(true)));
    sources.addButton({ title: "Stop audio" }).on("click", () => {
      audio.stop();
      this.source();
    });
    const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
    const signal = this.abort.signal;
    document.querySelector("#export")!.addEventListener(
      "click",
      () => {
        if (this.exporter.active) this.exporter.cancel();
        else void this.exportVideo();
      },
      { signal },
    );
    const focus = document.querySelector<HTMLButtonElement>("#focus")!;
    focus.addEventListener(
      "click",
      () => {
        const hidden = document.body.classList.toggle("focus-mode");
        focus.textContent = hidden ? "Show controls" : "Hide controls";
        focus.setAttribute("aria-pressed", String(hidden));
      },
      { signal },
    );
    document.querySelector("#fullscreen")!.addEventListener(
      "click",
      () => {
        void this.runView(async () => {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen();
        });
      },
      { signal },
    );
    document.addEventListener(
      "fullscreenchange",
      () => {
        document.querySelector("#fullscreen")!.textContent =
          document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
      },
      { signal },
    );
    window.addEventListener(
      "keydown",
      (event) => {
        if (
          event.code !== "Space" ||
          event.repeat ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        )
          return;
        if (
          (event.target as HTMLElement).closest(
            "input, select, textarea, button, a, [contenteditable]",
          )
        )
          return;
        event.preventDefault();
        void this.run(() => audio.togglePlayback());
      },
      { signal },
    );
    document
      .querySelector("#play")!
      .addEventListener(
        "click",
        () => void this.run(() => audio.togglePlayback()),
        {
          signal,
        },
      );
    this.seek.addEventListener(
      "input",
      () => {
        this.scrubbing = true;
        this.elapsed.textContent = this.formatTime(Number(this.seek.value));
      },
      { signal },
    );
    this.seek.addEventListener(
      "change",
      () => {
        audio.seek(Number(this.seek.value));
        this.scrubbing = false;
        this.transport();
      },
      { signal },
    );
    this.seek.addEventListener(
      "blur",
      () => {
        this.scrubbing = false;
      },
      { signal },
    );
    document
      .querySelector("#file")!
      .addEventListener("click", () => fileInput.click(), { signal });
    fileInput.addEventListener(
      "change",
      () => {
        if (fileInput.files?.[0]) void this.load(fileInput.files[0]);
        fileInput.value = "";
      },
      { signal },
    );
    window.addEventListener(
      "dragenter",
      (e) => {
        e.preventDefault();
        this.dragDepth++;
        document.body.classList.add("dragging");
      },
      { signal },
    );
    window.addEventListener("dragover", (e) => e.preventDefault(), { signal });
    window.addEventListener(
      "dragleave",
      () => {
        if (--this.dragDepth <= 0) document.body.classList.remove("dragging");
      },
      { signal },
    );
    window.addEventListener(
      "drop",
      (e) => {
        e.preventDefault();
        this.dragDepth = 0;
        document.body.classList.remove("dragging");
        const file = e.dataTransfer?.files[0];
        if (file) void this.load(file);
      },
      { signal },
    );
    const fps = document.querySelector("#fps")!,
      meter = document.querySelector<HTMLElement>("#meter")!;
    const resolution = document.querySelector<HTMLElement>("#resolution")!;
    host.onStats = () => {
      fps.textContent = host.stats.fps + " FPS";
      meter.style.transform =
        "scaleX(" + Math.min(1, audio.frame.rms * 3) + ")";
      resolution.textContent = host.stats.width + "×" + host.stats.height;
      resolution.title = host.stats.softwareGPU
        ? "Software rendering detected. Enable browser graphics acceleration for full quality."
        : "Internal render resolution · adaptive quality targets 60 FPS";
      this.transport();
    };
    host.onError = (message) => this.error(message);
    this.transport();
  }
  private formatTime(seconds: number) {
    const whole = Math.max(0, Math.floor(seconds));
    return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
  }
  private transport() {
    const audio = this.audio;
    const exporting = this.exporter.active;
    const exportButton = document.querySelector<HTMLButtonElement>("#export")!;
    exportButton.disabled = !audio.fileLoaded && !exporting;
    exportButton.textContent = exporting ? "Cancel export" : "Export video";
    this.play.disabled = exporting;
    this.play.textContent = audio.playing ? "Ⅱ  PAUSE" : "▶  PLAY";
    this.play.setAttribute("aria-label", audio.playing ? "Pause" : "Play");
    this.seek.disabled = audio.duration === 0 || exporting;
    this.seek.max = String(audio.duration || 1);
    this.duration.textContent =
      audio.hasSource && !audio.duration
        ? "LIVE"
        : this.formatTime(audio.duration);
    if (!this.scrubbing) {
      this.seek.value = String(audio.position);
      this.elapsed.textContent = this.formatTime(audio.position);
      this.seek.setAttribute(
        "aria-valuetext",
        this.formatTime(audio.position) +
          " of " +
          this.formatTime(audio.duration),
      );
    }
  }
  private source() {
    document.querySelector("#source-label")!.textContent =
      this.audio.sourceName.toUpperCase();
    document.querySelector("#status")!.textContent = !this.audio.hasSource
      ? "AUDIO STOPPED"
      : this.audio.playing
        ? "AUDIO CONNECTED"
        : "PAUSED";
    this.transport();
  }
  private async load(file: File) {
    if (this.exporter.active) return;
    if (
      !/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(file.name) &&
      !file.type.startsWith("audio/")
    ) {
      this.error("Choose an audio file: MP3, WAV, OGG or FLAC.");
      return;
    }
    await this.run(() => this.audio.file(file));
  }
  private async run(action: () => Promise<void>) {
    if (this.exporter.active) return;
    document.querySelector<HTMLElement>("#error")!.hidden = true;
    document.querySelector("#status")!.textContent = "CONNECTING AUDIO…";
    try {
      await action();
      this.source();
    } catch (e) {
      this.error(e instanceof Error ? e.message : "Unable to open audio.");
      this.source();
    }
  }
  private async runView(action: () => Promise<void>) {
    try {
      await action();
    } catch (e) {
      this.error(e instanceof Error ? e.message : "Fullscreen is unavailable.");
    }
  }
  error(message: string) {
    const element = document.querySelector<HTMLElement>("#error")!;
    element.textContent = message;
    element.hidden = false;
  }
  private async exportVideo() {
    const status = document.querySelector<HTMLElement>("#export-status")!;
    const rack = document.querySelector<HTMLElement>("#rack")!;
    const file = document.querySelector<HTMLButtonElement>("#file")!;
    const download =
      document.querySelector<HTMLAnchorElement>("#download-video")!;
    const quality =
      document.querySelector<HTMLSelectElement>("#export-quality")!;
    const fps = document.querySelector<HTMLSelectElement>("#export-fps")!;
    rack.inert = true;
    file.disabled = true;
    quality.disabled = true;
    fps.disabled = true;
    status.hidden = false;
    status.textContent = "Preparing full-song export…";
    try {
      const recording = this.exporter.record(
        this.host,
        this.audio,
        quality.value as keyof typeof EXPORT_PRESETS,
        Number(fps.value) as 30 | 60,
        (progress) => {
          const percent = Math.floor((progress.frame / progress.total) * 100);
          status.textContent = `${progress.phase} · ${quality.value.toUpperCase()} / ${fps.value} FPS · ${percent}% · ${this.formatTime(progress.seconds)} / ${this.formatTime(this.audio.duration)}. Every frame is rendered; this may take longer than the song.`;
        },
      );
      this.transport();
      const blob = await recording;
      if (this.downloadURL) URL.revokeObjectURL(this.downloadURL);
      this.downloadURL = URL.createObjectURL(blob);
      download.href = this.downloadURL;
      download.download =
        this.audio.sourceName.replace(/\.[^.]+$/, "") +
        "-visualization." +
        (blob.type.includes("mp4") ? "mp4" : "webm");
      download.hidden = false;
      status.textContent =
        "Video ready. Select Download video to save the full song.";
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Unable to export video.";
    } finally {
      rack.inert = false;
      file.disabled = false;
      quality.disabled = false;
      fps.disabled = false;
      this.transport();
      this.source();
    }
  }
  dispose() {
    this.exporter.cancel();
    if (this.downloadURL) URL.revokeObjectURL(this.downloadURL);
    this.abort.abort();
    this.pane.dispose();
    this.host.onStats = null;
    this.host.onError = null;
  }
}
