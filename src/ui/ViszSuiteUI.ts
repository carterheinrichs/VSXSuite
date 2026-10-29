import { Pane } from "tweakpane";
import type { VisualizerHost } from "../core/VisualizerHost";
import type { AudioEngine } from "../audio/AudioEngine";
import type { IVisualModule } from "../core/types";
const descriptions: Record<string, string> = {
  neon: "A living echo. Infinite color, folded through time.",
  fractal: "An endless flight through iridescent liquid geometry.",
  ferrofluid: "Magnetic sculpture. Sound, suspended in liquid metal.",
};
export class ViszSuiteUI {
  private readonly pane: Pane;
  private readonly abort = new AbortController();
  private dragDepth = 0;
  private scrubbing = false;
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
    visual
      .addBinding(host.settings, "scene", {
        label: "Scene",
        options: {
          "Neon feedback": "neon",
          "Liquid infinity": "fractal",
          "Magnetic matter": "ferrofluid",
        },
      })
      .on("change", (e) => {
        host.select(e.value);
        this.title();
      });
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
    const presets = this.pane.addFolder({
      title: "02  ATMOSPHERES",
      expanded: false,
    });
    presets
      .addButton({ title: "PRISM / electric dreams" })
      .on("click", () => this.preset("neon", false, 0.8));
    presets
      .addButton({ title: "CHROME / infinite drift" })
      .on("click", () => this.preset("fractal", false, 0.4));
    presets
      .addButton({ title: "AFTERHOURS / magnetic bloom" })
      .on("click", () => this.preset("ferrofluid", false, 0.45));
    const sources = this.pane.addFolder({
      title: "03  AUDIO SOURCE",
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
    document
      .querySelectorAll<HTMLButtonElement>("[data-scene]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            this.host.select(button.dataset.scene!);
            this.pane.refresh();
            this.title();
          },
          { signal },
        );
      });
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
    this.title();
    this.transport();
  }
  private formatTime(seconds: number) {
    const whole = Math.max(0, Math.floor(seconds));
    return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
  }
  private transport() {
    const audio = this.audio;
    this.play.textContent = audio.playing ? "Ⅱ  PAUSE" : "▶  PLAY";
    this.play.setAttribute("aria-label", audio.playing ? "Pause" : "Play");
    this.seek.disabled = audio.duration === 0;
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
  private preset(scene: string, overlay: boolean, bloom: number) {
    this.host.select(scene);
    this.host.settings.overlay = overlay;
    this.host.post.params.bloom = bloom;
    this.host.settings.postFX = true;
    this.pane.refresh();
    this.title();
  }
  private title() {
    document
      .querySelectorAll<HTMLButtonElement>("[data-scene]")
      .forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.scene === this.host.settings.scene),
        );
      });
    document.querySelector("#scene-title")!.textContent =
      this.host.modules.find((m) => m.id === this.host.settings.scene)!.name;
    document.querySelector("#scene-description")!.textContent =
      descriptions[this.host.settings.scene];
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
  dispose() {
    this.abort.abort();
    this.pane.dispose();
    this.host.onStats = null;
    this.host.onError = null;
  }
}
