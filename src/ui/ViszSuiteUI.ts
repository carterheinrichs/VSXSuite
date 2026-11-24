import { Pane } from "tweakpane";
import type { VisualizerHost } from "../core/VisualizerHost";
import type { AudioEngine, PlaybackMode } from "../audio/AudioEngine";
import {
  getCatalogTracks,
  parseCatalogTrack,
  probeTrackDuration,
  subscribeCatalog,
  type CatalogTrack,
} from "../audio/MusicCatalog";
import type { IVisualModule } from "../core/types";
import { VideoExporter, type EXPORT_PRESETS } from "../core/VideoExporter";
import { saveVideo } from "../core/saveVideo";

export type TrackProbeState =
  | { status: "pending" }
  | { status: "ready"; duration: number }
  | { status: "failed" };

export class ViszSuiteUI {
  private readonly pane: Pane;
  private readonly abort = new AbortController();
  private dragDepth = 0;
  private scrubbing = false;
  private connectingAudio = false;
  private readonly exporter = new VideoExporter();
  private downloadURL = "";
  private localTracks: CatalogTrack[] = [];
  private localURLs: string[] = [];
  private catalogTracks: CatalogTrack[] = getCatalogTracks();
  private readonly catalogProbes = new Map<string, TrackProbeState>();
  private activeTrackId = "";
  private queue: CatalogTrack[] = [];
  private readonly unsubscribeCatalog: () => void;
  private readonly play = document.querySelector<HTMLButtonElement>("#play")!;
  private readonly seek = document.querySelector<HTMLInputElement>("#seek")!;
  private readonly elapsed = document.querySelector<HTMLElement>("#elapsed")!;
  private readonly duration = document.querySelector<HTMLElement>("#duration")!;
  private readonly footer = document.querySelector<HTMLElement>("footer")!;
  private readonly exportDialog =
    document.querySelector<HTMLDialogElement>("#export-dialog")!;
  constructor(
    private readonly host: VisualizerHost,
    private readonly audio: AudioEngine,
  ) {
    this.pane = new Pane({
      container: document.querySelector("#rack-controls")!,
    });
    const visual = this.pane.addFolder({ title: "VISUAL ENGINE" });
    const sceneFolders = new Map<string, ReturnType<Pane["addFolder"]>>();
    const bindCollapsiblePanel = (
      panelSelector: string,
      contentSelector: string,
      toggleSelector: string,
      expandLabel: string,
      minimizeLabel: string,
    ) => {
      const panel = document.querySelector<HTMLElement>(panelSelector)!;
      const content = document.querySelector<HTMLElement>(contentSelector)!;
      const toggle = document.querySelector<HTMLButtonElement>(toggleSelector)!;
      toggle.addEventListener(
        "click",
        () => {
          const collapsed = panel.classList.toggle("is-collapsed");
          content.inert = collapsed;
          toggle.setAttribute("aria-expanded", String(!collapsed));
          toggle.setAttribute(
            "aria-label",
            collapsed ? expandLabel : minimizeLabel,
          );
        },
        { signal: this.abort.signal },
      );
    };
    bindCollapsiblePanel(
      "#catalog",
      "#catalog-content",
      "#catalog-toggle",
      "Expand music catalog",
      "Minimize music catalog",
    );
    bindCollapsiblePanel(
      "#queue",
      "#queue-content",
      "#queue-toggle",
      "Expand queue",
      "Minimize queue",
    );
    document
      .querySelector("#queue-next")!
      .addEventListener("click", () => void this.playNext(), {
        signal: this.abort.signal,
      });
    document.querySelector("#queue-clear")!.addEventListener(
      "click",
      () => {
        this.queue = [];
        this.renderQueue();
      },
      { signal: this.abort.signal },
    );
    document
      .querySelector("#playback-next")!
      .addEventListener("click", () => void this.playNext(), {
        signal: this.abort.signal,
      });
    const playbackMode =
      document.querySelector<HTMLSelectElement>("#playback-mode")!;
    playbackMode.value = audio.playbackMode;
    playbackMode.addEventListener(
      "change",
      () => {
        audio.playbackMode = playbackMode.value as PlaybackMode;
      },
      { signal: this.abort.signal },
    );
    audio.onEnded = () => {
      if (audio.playbackMode === "queue") void this.playNext();
    };
    this.bindMusicPage();
    this.renderQueue();
    this.renderCatalog();
    this.unsubscribeCatalog = subscribeCatalog((tracks) => {
      this.setCatalogTracks(tracks);
    });
    bindCollapsiblePanel(
      "#library",
      "#library-content",
      "#library-toggle",
      "Expand visualizers",
      "Minimize visualizers",
    );
    bindCollapsiblePanel(
      "#rack",
      "#rack-controls",
      "#rack-toggle",
      "Expand control rack",
      "Minimize control rack",
    );
    const grid = document.querySelector<HTMLElement>("#scene-grid")!;
    const count = document.querySelector<HTMLElement>("#scene-count")!;
    const search = document.querySelector<HTMLInputElement>("#scene-search")!;
    const syncSceneLoading = () => {
      for (const button of grid.querySelectorAll<HTMLButtonElement>(
        "[data-scene]",
      )) {
        const loading = button.dataset.scene === host.preparingScene;
        button.setAttribute("aria-busy", String(loading));
        button.querySelector<HTMLElement>(".scene-loading")!.hidden = !loading;
      }
    };
    host.onPreparationChange = syncSceneLoading;
    let category = "All";
    const categoryFor = (id: string, index: number) =>
      ["hubble-nebula", "human-heart", "hubble-acid", "fireplace"].includes(id)
        ? "Natural"
        : [
              "classic-spectrum",
              "oscilloscope",
              "lissajous",
              "waterfall",
              "starfield",
              "harmonic-waves",
              "radial-spectrum",
              "retro-plasma",
            ].includes(id)
          ? "Classic"
          : id === "cyclic-automaton" ||
              id === "game-of-life" ||
              id === "function-stage" ||
              [3, 4, 5, 9, 10, 13, 14].includes(index)
            ? "Geometric"
            : "Atmospheric";
    const renderLibrary = () => {
      grid.replaceChildren();
      host.modules.forEach((module, index) => {
        if (
          (category !== "All" && categoryFor(module.id, index) !== category) ||
          !module.name.toLowerCase().includes(search.value.toLowerCase())
        )
          return;
        const button = document.createElement("button");
        button.className = "scene-card";
        button.dataset.scene = module.id;
        button.setAttribute(
          "aria-pressed",
          String(host.settings.scene === module.id),
        );
        const art = document.createElement("img");
        art.className = "scene-art";
        art.src = `/thumbnails/${module.id}.webp`;
        art.alt = "";
        art.loading = "lazy";
        art.width = 320;
        art.height = 180;
        const name = document.createElement("strong");
        name.textContent = module.name;
        const tag = document.createElement("small");
        tag.textContent = categoryFor(module.id, index);
        const loading = document.createElement("span");
        loading.className = "scene-loading";
        loading.textContent = "Loading…";
        loading.setAttribute("role", "status");
        loading.hidden = true;
        button.append(art, name, tag, loading);
        button.addEventListener(
          "click",
          async () => {
            if (this.exporter.active) return;
            await host.select(module.id);
            for (const [id, folder] of sceneFolders)
              folder.hidden = id !== host.settings.scene;
            renderLibrary();
          },
          { signal: this.abort.signal },
        );
        grid.append(button);
      });
      count.textContent = String(grid.childElementCount);
      syncSceneLoading();
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
      dialog.addEventListener(
        "close",
        () => {
          if (!this.exporter.active)
            document.querySelector<HTMLElement>("#export-status")!.hidden =
              true;
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
    for (const layer of [host.logoOverlay, host.textOverlay]) {
      const folder = visual.addFolder({
        title: layer.kind === "logo" ? "Logo overlay" : "Text overlay",
        expanded: false,
      });
      folder.addBinding(layer.params, "enabled", { label: "Show overlay" });
      if (layer.kind === "logo") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.hidden = true;
        input.setAttribute("aria-label", "Upload logo image");
        folder.element.append(input);
        const upload = folder.addButton({ title: "Upload logo image" });
        upload.on("click", () => input.click());
        let uploadVersion = 0;
        input.addEventListener(
          "change",
          async () => {
            const file = input.files?.[0];
            if (!file) return;
            const version = ++uploadVersion;
            try {
              await layer.loadLogo(file);
              if (version !== uploadVersion || this.abort.signal.aborted)
                return;
              upload.title = file.name;
              folder.refresh();
            } catch (error) {
              this.error((error as Error).message);
            } finally {
              input.value = "";
            }
          },
          { signal: this.abort.signal },
        );
        folder.addButton({ title: "Remove logo" }).on("click", () => {
          uploadVersion++;
          layer.clearLogo();
          upload.title = "Upload logo image";
          folder.refresh();
        });
      } else {
        folder.addBinding(layer.text, "nowPlaying", { label: "Now playing" });
        folder.addBinding(layer.text, "text", {
          label: "Text (| for new line)",
        });
        folder.addBinding(layer.text, "color", { label: "Text color" });
        folder.addBinding(layer.text, "font", {
          options: {
            Modern: "sans-serif",
            Editorial: "serif",
            Terminal: "monospace",
          },
        });
        folder.addBinding(layer.text, "bold");
      }
      folder.addBinding(layer.params, "scale", {
        min: 0.05,
        max: 2,
        step: 0.01,
      });
      folder.addBinding(layer.params, "x", {
        label: "Horizontal position",
        min: 0,
        max: 1,
        step: 0.01,
      });
      folder.addBinding(layer.params, "y", {
        label: "Vertical position",
        min: 0,
        max: 1,
        step: 0.01,
      });
      folder.addBinding(layer.params, "rotation", {
        min: -180,
        max: 180,
        step: 1,
      });
      folder.addBinding(layer.params, "opacity", {
        min: 0,
        max: 1,
        step: 0.01,
      });
      folder.addBinding(layer.params, "reactivity", {
        label: "Music response",
        min: 0,
        max: 3,
        step: 0.01,
      });
      folder.addBinding(layer.params, "motion", {
        label: "Float",
        min: 0,
        max: 3,
        step: 0.01,
      });
      folder.addBinding(layer.params, "glow", { min: 0, max: 3, step: 0.01 });
    }
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
        if (module.controls?.[key])
          folder.addBinding(module.params, key, module.controls[key]);
        else if (typeof value === "string")
          folder.addBinding(module.params, key);
        else if (typeof value === "boolean")
          folder.addBinding(module.params, key);
        else if (key === "waveCount")
          folder.addBinding(module.params, key, {
            label: "Waves",
            options: { Two: 2, Three: 3 },
          });
        else if (key === "bands")
          folder.addBinding(module.params, key, { min: 16, max: 128, step: 1 });
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
      title: "AUDIO SOURCE",
      expanded: false,
    });
    sources.addButton({ title: "Procedural beat" }).on("click", () => {
      void this.run(async () => {
        await audio.synth();
        this.activeTrackId = "";
        this.renderCatalog();
        this.resetExportState();
      });
    });
    sources.addButton({ title: "Microphone" }).on("click", () => {
      void this.run(async () => {
        await audio.input();
        this.activeTrackId = "";
        this.renderCatalog();
        this.resetExportState();
      });
    });
    sources.addButton({ title: "Share system / tab audio" }).on("click", () => {
      void this.run(async () => {
        await audio.input(true);
        this.activeTrackId = "";
        this.renderCatalog();
        this.resetExportState();
      });
    });
    sources.addButton({ title: "Stop audio" }).on("click", () => {
      this.activeTrackId = "";
      this.scrubbing = false;
      this.renderCatalog();
      audio.stop();
      this.resetExportState();
      this.source();
    });
    document
      .querySelectorAll<HTMLElement>("#rack-controls .tp-fldv_m")
      .forEach((marker) => {
        marker.setAttribute("aria-hidden", "true");
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("viewBox", "0 0 16 16");
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        path.setAttribute("d", "m4 6 4 4 4-4");
        svg.append(path);
        marker.replaceChildren(svg);
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
    document.querySelector("#download-video")!.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        void this.downloadVideo();
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
        if (this.exporter.active) return;
        this.dragDepth++;
        document.body.classList.add("dragging");
      },
      { signal },
    );
    window.addEventListener("dragover", (e) => e.preventDefault(), { signal });
    window.addEventListener(
      "dragleave",
      () => {
        this.dragDepth = Math.max(0, this.dragDepth - 1);
        if (this.dragDepth === 0) document.body.classList.remove("dragging");
      },
      { signal },
    );
    window.addEventListener(
      "drop",
      (e) => {
        e.preventDefault();
        this.dragDepth = 0;
        document.body.classList.remove("dragging");
        if (this.exporter.active) return;
        const file = e.dataTransfer?.files[0];
        if (file) void this.load(file);
      },
      { signal },
    );
    const fps = document.querySelector("#fps")!,
      meter = document.querySelector<HTMLElement>("#meter")!;
    const resolution = document.querySelector<HTMLElement>("#resolution")!;
    audio.onStateChange = () => {
      if (audio.sourceKind !== "catalog" && this.activeTrackId) {
        this.activeTrackId = "";
        this.renderCatalog();
      }
      if (!this.connectingAudio) this.source();
    };
    this.exporter.onStateChange = (state) => {
      this.exportDialog.dataset.exportState = state.status;
    };
    this.exportDialog.dataset.exportState = this.exporter.state.status;
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
    this.footer.dataset.audioState = this.audio.transportState;
    this.transport();
  }
  private bindMusicPage() {
    const signal = this.abort.signal;
    const page = document.querySelector<HTMLElement>("#music-page")!;
    const catalog = document.querySelector<HTMLElement>("#catalog")!;
    const queue = document.querySelector<HTMLElement>("#queue")!;
    const catalogHome = document.createComment("catalog home");
    const queueHome = document.createComment("queue home");
    catalog.before(catalogHome);
    queue.before(queueHome);
    const navigate = () => {
      const music = location.hash === "#music";
      document.body.classList.toggle("music-page", music);
      page.hidden = !music;
      if (music) {
        document.body.classList.remove("focus-mode");
        const focus = document.querySelector<HTMLButtonElement>("#focus")!;
        focus.textContent = "Hide controls";
        focus.setAttribute("aria-pressed", "false");
        document.querySelector("#music-catalog-slot")!.append(catalog);
        document.querySelector("#music-queue-slot")!.append(queue);
      } else {
        catalogHome.after(catalog);
        queueHome.after(queue);
      }
      document
        .querySelector("#music-open")!
        .setAttribute("aria-current", music ? "page" : "false");
    };
    window.addEventListener("hashchange", navigate, { signal });
    navigate();
    for (const [buttonId, inputId] of [
      ["choose-folder", "folder-input"],
      ["choose-tracks", "tracks-input"],
    ]) {
      const input = document.querySelector<HTMLInputElement>(`#${inputId}`)!;
      document
        .querySelector(`#${buttonId}`)!
        .addEventListener("click", () => input.click(), { signal });
      input.addEventListener(
        "change",
        () => {
          const files = Array.from(input.files ?? []);
          if (!files.length) return;
          const audioFiles = files.filter(
            (file) =>
              /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(file.name) ||
              file.type.startsWith("audio/"),
          );
          // Retain earlier object URLs: queued and currently playing tracks may still use them.
          this.localTracks = audioFiles
            .map((file) => {
              const url = URL.createObjectURL(file);
              this.localURLs.push(url);
              const track = parseCatalogTrack(
                file.webkitRelativePath || file.name,
                url,
              );
              return {
                ...track,
                id: url,
                details: `${file.name.split(".").pop()!.toUpperCase()} · ${(file.size / 1048576).toFixed(1)} MB`,
              };
            })
            .sort((a, b) =>
              a.displayName.localeCompare(b.displayName, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            );
          this.setCatalogTracks(getCatalogTracks());
          const folder =
            files[0].webkitRelativePath.split("/")[0] || "Selected files";
          document.querySelector("#folder-status")!.textContent =
            `${folder}: ${audioFiles.length} audio tracks. Choose another folder or files to replace the library; queued songs remain available.`;
          input.value = "";
        },
        { signal },
      );
    }
  }
  setCatalogTracks(tracks: CatalogTrack[]) {
    tracks = [...tracks, ...this.localTracks];
    this.catalogTracks = tracks;
    if (
      this.activeTrackId &&
      !tracks.some((track) => track.id === this.activeTrackId)
    ) {
      this.activeTrackId = "";
    }
    this.renderCatalog();
  }
  private renderCatalog() {
    const list = document.querySelector<HTMLElement>("#catalog-list")!;
    const count = document.querySelector<HTMLElement>("#catalog-count")!;
    list.replaceChildren();
    count.textContent = String(this.catalogTracks.length);
    if (!this.catalogTracks.length) {
      const empty = document.createElement("p");
      empty.className = "catalog-empty";
      empty.textContent = "Place audio files in /music named Name - Author.ext";
      list.append(empty);
      return;
    }
    for (const track of this.catalogTracks) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "catalog-track";
      button.dataset.track = track.id;
      if (track.details) button.title = track.details;
      button.setAttribute(
        "aria-pressed",
        String(this.activeTrackId === track.id),
      );
      const title = document.createElement("span");
      title.className = "catalog-track-title";
      title.textContent = track.displayName;
      const runtime = document.createElement("span");
      runtime.className = "catalog-track-runtime";
      const probe = this.catalogProbes.get(track.id);
      runtime.textContent =
        probe?.status === "ready" ? this.formatTime(probe.duration) : "—:—";
      button.append(title, runtime);
      button.addEventListener(
        "click",
        () => void this.loadCatalogTrack(track),
        { signal: this.abort.signal },
      );
      const row = document.createElement("div");
      row.className = "catalog-row";
      const enqueue = document.createElement("button");
      enqueue.type = "button";
      enqueue.textContent = "+";
      enqueue.className = "queue-icon-button";
      enqueue.setAttribute("aria-label", `Add ${track.displayName} to queue`);
      enqueue.addEventListener("click", () => {
        this.queue.push(track);
        this.renderQueue();
      });
      row.append(button, enqueue);
      list.append(row);
      if (!probe) {
        this.catalogProbes.set(track.id, { status: "pending" });
        void probeTrackDuration(track.url, this.abort.signal)
          .then((duration) => {
            this.catalogProbes.set(track.id, { status: "ready", duration });
            this.updateTrackRuntime(track.id, duration);
          })
          .catch(() => {
            this.catalogProbes.set(track.id, { status: "failed" });
          });
      }
    }
  }
  private renderQueue() {
    const list = document.querySelector("#queue-list")!;
    list.replaceChildren();
    document.querySelector("#queue-count")!.textContent = String(
      this.queue.length,
    );
    for (const [index, track] of this.queue.entries()) {
      const row = document.createElement("li");
      const title = document.createElement("span");
      title.textContent = track.displayName;
      title.title = track.displayName;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.className = "queue-icon-button";
      remove.setAttribute(
        "aria-label",
        `Remove ${track.displayName} from queue`,
      );
      remove.addEventListener("click", () => {
        this.queue.splice(index, 1);
        this.renderQueue();
      });
      row.append(title, remove);
      list.append(row);
    }
    if (!this.queue.length) {
      const empty = document.createElement("li");
      empty.className = "catalog-empty";
      empty.textContent = "Queue is empty. Add songs with + in the catalog.";
      list.append(empty);
    }
    for (const id of ["queue-next", "queue-clear", "playback-next"]) {
      document.querySelector<HTMLButtonElement>(`#${id}`)!.disabled =
        !this.queue.length;
    }
  }
  private async playNext() {
    if (this.exporter.active || this.connectingAudio) return;
    const track = this.queue.shift();
    if (!track) return;
    this.renderQueue();
    if (!(await this.loadCatalogTrack(track))) {
      this.queue.unshift(track);
      this.renderQueue();
    }
  }
  private updateTrackRuntime(trackId: string, duration: number) {
    const buttons =
      document.querySelectorAll<HTMLButtonElement>(".catalog-track");
    for (const button of buttons) {
      if (button.dataset.track === trackId) {
        const runtime = button.querySelector<HTMLElement>(
          ".catalog-track-runtime",
        );
        if (runtime) runtime.textContent = this.formatTime(duration);
      }
    }
  }
  private async loadCatalogTrack(track: CatalogTrack) {
    if (this.exporter.active) return;
    return this.run(async () => {
      await this.audio.track(track.url, track.displayName);
      this.activeTrackId = track.id;
      this.renderCatalog();
      this.resetExportState();
      if (this.audio.duration > 0) {
        this.catalogProbes.set(track.id, {
          status: "ready",
          duration: this.audio.duration,
        });
        this.updateTrackRuntime(track.id, this.audio.duration);
      }
    });
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
    document.querySelector<HTMLSelectElement>("#playback-mode")!.disabled =
      exporting;
    for (const id of ["playback-next", "queue-next"]) {
      document.querySelector<HTMLButtonElement>(`#${id}`)!.disabled =
        !this.queue.length || exporting || this.connectingAudio;
    }
    this.play.textContent = audio.playing ? "\u2161  PAUSE" : "\u25b6  PLAY";
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
    this.footer.dataset.audioState = this.connectingAudio
      ? "connecting"
      : audio.transportState;
  }
  private source() {
    const state = this.audio.transportState;
    document.querySelector("#source-label")!.textContent =
      this.audio.nowPlayingText;
    document.querySelector("#status")!.textContent =
      state === "idle"
        ? "READY TO EXPLORE"
        : !this.audio.hasSource
          ? "AUDIO STOPPED"
          : this.audio.playing
            ? "AUDIO CONNECTED"
            : "PAUSED";
    this.transport();
  }
  private resetExportState() {
    this.exporter.reset();
    document.querySelector<HTMLElement>("#export-status")!.hidden = true;
    document.querySelector<HTMLElement>("#download-video")!.hidden = true;
    if (this.downloadURL) {
      URL.revokeObjectURL(this.downloadURL);
      this.downloadURL = "";
    }
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
    await this.run(async () => {
      await this.audio.file(file);
      this.activeTrackId = "";
      this.renderCatalog();
      this.resetExportState();
    });
  }
  private async run(action: () => Promise<void>) {
    if (this.exporter.active) return;
    this.scrubbing = false;
    this.connectingAudio = true;
    document.querySelector<HTMLElement>("#error")!.hidden = true;
    document.querySelector("#status")!.textContent = "CONNECTING AUDIO…";
    this.footer.dataset.audioState = "connecting";
    try {
      await action();
      this.connectingAudio = false;
      this.source();
      return true;
    } catch (e) {
      this.connectingAudio = false;
      this.error(e instanceof Error ? e.message : "Unable to open audio.");
      this.source();
      return false;
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
  private async downloadVideo() {
    const state = this.exporter.state;
    if (state.status !== "completed") return;
    const download =
      document.querySelector<HTMLAnchorElement>("#download-video")!;
    const status = document.querySelector<HTMLElement>("#export-status")!;
    status.hidden = false;
    status.textContent = "Saving video…";
    try {
      if (await saveVideo(state.blob, download.download)) {
        status.textContent = "Video saved.";
      } else {
        const link = document.createElement("a");
        link.href = download.href;
        link.download = download.download;
        document.body.append(link);
        link.click();
        link.remove();
        status.textContent =
          "Download started. Check your browser’s downloads for completion. If it fails, try a regular browser window or a lower export resolution.";
      }
    } catch (error) {
      status.textContent =
        error instanceof DOMException && error.name === "AbortError"
          ? "Save canceled. Select Download video to try again."
          : `Unable to save video: ${error instanceof Error ? error.message : "Unknown error"}. Select Download video to retry.`;
    }
  }
  private async exportVideo() {
    const status = document.querySelector<HTMLElement>("#export-status")!;
    const rack = document.querySelector<HTMLElement>("#rack")!;
    const catalog = document.querySelector<HTMLElement>("#catalog")!;
    const library = document.querySelector<HTMLElement>("#library")!;
    const file = document.querySelector<HTMLButtonElement>("#file")!;
    const download =
      document.querySelector<HTMLAnchorElement>("#download-video")!;
    const quality =
      document.querySelector<HTMLSelectElement>("#export-quality")!;
    const fps = document.querySelector<HTMLSelectElement>("#export-fps")!;
    const portrait =
      document.querySelector<HTMLInputElement>("#export-portrait")!;
    this.dragDepth = 0;
    document.body.classList.remove("dragging");
    rack.inert = true;
    catalog.inert = true;
    library.inert = true;
    document.querySelector<HTMLElement>("#queue")!.inert = true;
    file.disabled = true;
    quality.disabled = true;
    fps.disabled = true;
    portrait.disabled = true;
    download.hidden = true;
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
          status.textContent = `${progress.phase} · ${quality.value.toUpperCase()} / ${fps.value} FPS / ${portrait.checked ? "Portrait" : "Landscape"} · ${percent}% · ${this.formatTime(progress.seconds)} / ${this.formatTime(this.audio.duration)}. Every frame is rendered; this may take longer than the song.`;
        },
        portrait.checked,
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
      void new Audio("/export-ready.mp3").play().catch(() => {});
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Unable to export video.";
    } finally {
      rack.inert = false;
      catalog.inert = false;
      library.inert = false;
      document.querySelector<HTMLElement>("#queue")!.inert = false;
      file.disabled = false;
      quality.disabled = false;
      fps.disabled = false;
      portrait.disabled = false;
      this.transport();
      this.source();
    }
  }
  dispose() {
    this.exporter.cancel();
    if (this.downloadURL) URL.revokeObjectURL(this.downloadURL);
    this.unsubscribeCatalog();
    this.abort.abort();
    this.pane.dispose();
    for (const url of this.localURLs) URL.revokeObjectURL(url);
    this.audio.onStateChange = null;
    this.audio.onEnded = null;
    this.exporter.onStateChange = null;
    this.host.onStats = null;
    this.host.onError = null;
    this.host.onPreparationChange = null;
  }
}
