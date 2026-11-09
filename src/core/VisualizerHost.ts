import { HubbleNebulaModule } from "../modules/HubbleNebulaModule";
import { HumanHeartModule } from "../modules/HumanHeartModule";
import { RecursiveChromeModule } from "../modules/RecursiveChromeModule";
import { EvolvingAtmosphereModule } from "../modules/EvolvingAtmosphereModule";
import * as T from "three";
import { AudioEngine } from "../audio/AudioEngine";
import type { AudioFrameData, IVisualModule } from "./types";
import { target, FullscreenPass } from "../shaders/shared";
import { NeonFeedbackModule } from "../modules/NeonFeedbackModule";
import {
  PsychedelicBloomModule,
  AcidChromeModule,
  PulseReactorModule,
  PrismaticTunnelModule,
  TopographicContoursModule,
} from "../modules/PsychedelicModules";
import {
  AuroraRibbonsModule,
  PrismaticDriftModule,
  XenonBladesModule,
  VectorLatticeModule,
  SolarMandalaModule,
  HypernovaVortexModule,
  NexusSpectrumModule,
  TeslaPlasmaModule,
  LaserCathedralModule,
  ApexTrianglesModule,
} from "../modules/ConsoleLightModules";
import { RealisticFerrofluidModule } from "../modules/RealisticFerrofluidModule";
import { MasterPostFXModule } from "../modules/MasterPostFXModule";
import {
  ClassicSpectrumModule,
  OscilloscopeModule,
  LissajousModule,
  WaterfallModule,
  StarfieldModule,
} from "../modules/ClassicModules";
export type HostMode =
  "realtime" | "hidden" | "exporting" | "context_lost" | "disposed";

export type RenderPath =
  | "neon_raw"
  | "neon_post"
  | "scene_raw"
  | "scene_post"
  | "scene_overlay_raw"
  | "scene_overlay_fused_post";

export class VisualizerHost {
  readonly renderer: T.WebGLRenderer;
  readonly neon = new NeonFeedbackModule();
  readonly modules: IVisualModule[] = [
    this.neon,
    new AuroraRibbonsModule(),
    new PrismaticDriftModule(),
    new XenonBladesModule(),
    new VectorLatticeModule(),
    new SolarMandalaModule(),
    new HypernovaVortexModule(),
    new NexusSpectrumModule(),
    new TeslaPlasmaModule(),
    new LaserCathedralModule(),
    new ApexTrianglesModule(),
    new PsychedelicBloomModule(),
    new AcidChromeModule(),
    new PulseReactorModule(),
    new PrismaticTunnelModule(),
    new TopographicContoursModule(),
    new RecursiveChromeModule(),
    new RealisticFerrofluidModule(),
    new EvolvingAtmosphereModule(),
    new ClassicSpectrumModule(),
    new OscilloscopeModule(),
    new LissajousModule(),
    new WaterfallModule(),
    new StarfieldModule(),
    new HubbleNebulaModule(),
    new HumanHeartModule(),
  ];
  readonly post = new MasterPostFXModule();
  readonly settings = {
    scene: "neon",
    overlay: false,
    postFX: true,
    quality: 1,
    autoQuality: true,
  };
  readonly stats = { fps: 60, width: 0, height: 0, softwareGPU: false };
  private adaptiveScale = 1;
  private qualityTime = 0;
  private qualityFrames = 0;
  private recoveryTime = 0;
  private recoveryDelay = 30;
  private selectionVersion = 0;
  private readonly pixelBudget: number;
  private a: T.WebGLRenderTarget;
  private b: T.WebGLRenderTarget;
  private readonly output: FullscreenPass;
  private previous = 0;
  private elapsed = 0;
  private frameId = 0;
  private frames = 0;
  private statsTime = 0;
  private wasOverlayActive = false;
  mode: HostMode = "realtime";
  renderPath: RenderPath = "neon_post";
  onStats: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;
  get exporting() {
    return this.mode === "exporting";
  }
  set exporting(value: boolean) {
    if (value) this.setMode("exporting");
    else if (this.mode === "exporting") {
      this.setMode(document.hidden ? "hidden" : "realtime");
    }
  }
  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly audio: AudioEngine,
  ) {
    const context = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });
    if (!context) throw new Error("VSXSuite requires a browser with WebGL2.");
    if (!context.getExtension("EXT_color_buffer_float"))
      throw new Error(
        "Your GPU does not support HDR floating-point render targets.",
      );
    this.renderer = new T.WebGLRenderer({ canvas, context, antialias: false });
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    const gpu = debug
      ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL))
      : "";
    this.stats.softwareGPU =
      /swiftshader|llvmpipe|software|microsoft basic|warp/i.test(gpu);
    this.pixelBudget = this.stats.softwareGPU ? 640 * 360 : 1280 * 720;
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = T.NoToneMapping;
    this.renderer.setClearColor(0x000000, 1);
    this.a = target(1, 1, true);
    this.b = target(1, 1, false);
    this.output = new FullscreenPass(
      `precision highp float;varying vec2 vUv;uniform sampler2D image;uniform float raw;void main(){vec3 c=texture2D(image,vUv).rgb;if(raw>.5)c=pow(c/(1.+c),vec3(1./2.2));float n=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));c=clamp(c+vec3(n-.5)/255.,0.,1.);gl_FragColor=vec4(c,1.);}`,
      { image: { value: null }, raw: { value: 0 } },
    );
    for (let i = 0; i < this.modules.length; i++)
      this.modules[i].init(this.renderer, 1, 1);
    this.post.init(this.renderer, 1, 1);
    this.resize();
    this.clear();
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.visibility);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    canvas.addEventListener("webglcontextrestored", this.contextRestored);
    this.syncMode(document.hidden ? "hidden" : "realtime");
  }
  private syncMode(next: HostMode) {
    this.mode = next;
    this.canvas.dataset.hostMode = next;
    if (next === "realtime") {
      if (!this.frameId) {
        this.previous = 0;
        this.frameId = requestAnimationFrame(this.tick);
      }
    } else if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
  }
  private setMode(next: HostMode) {
    if (this.mode === "disposed") return;
    if (this.mode === "context_lost" && next !== "disposed") return;
    this.syncMode(next);
  }
  private contextLost = (e: Event) => {
    e.preventDefault();
    this.setMode("context_lost");
    this.onError?.("Graphics context lost. Waiting for the GPU to recover…");
  };
  private contextRestored = () => {
    window.location.reload();
  };
  private visibility = () => {
    if (
      this.mode === "exporting" ||
      this.mode === "context_lost" ||
      this.mode === "disposed"
    )
      return;
    this.setMode(document.hidden ? "hidden" : "realtime");
  };
  resetAdaptation() {
    this.qualityTime = 0;
    this.qualityFrames = 0;
    this.recoveryTime = 0;
  }
  resize = () => {
    if (this.exporting) return;
    this.resetAdaptation();
    // Bounded CSS budget when autoQuality is active; unlocks native HiDPI/4K when manual.
    const dpr = this.settings.autoQuality
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);
    const viewW = window.innerWidth * dpr;
    const viewH = window.innerHeight * dpr;
    const budget = this.settings.autoQuality ? this.pixelBudget : 3840 * 2160;
    const scale =
      Math.min(this.settings.quality, Math.sqrt(budget / (viewW * viewH))) *
      (this.settings.autoQuality ? this.adaptiveScale : 1);
    const w = Math.max(1, Math.floor(viewW * scale)),
      h = Math.max(1, Math.floor(viewH * scale));
    this.setSize(w, h);
  };
  private setSize(w: number, h: number, clear = false) {
    if (w === this.stats.width && h === this.stats.height && !clear) return;
    this.renderer.setSize(w, h, false);
    this.stats.width = w;
    this.stats.height = h;
    this.a.setSize(w, h);
    this.b.setSize(w, h);
    for (let i = 0; i < this.modules.length; i++) this.modules[i].resize(w, h);
    this.post.resize(w, h);
    if (clear) this.clear();
  }
  beginOfflineExport(width: number, height: number) {
    this.setMode("exporting");
    for (let i = 0; i < this.modules.length; i++) this.modules[i].reset?.();
    this.post.reset();
    this.setSize(width, height, true);
  }
  endOfflineExport() {
    if (this.mode === "exporting") {
      this.mode = document.hidden ? "hidden" : "realtime";
    }
    this.previous = 0;
    this.resize();
    this.clear();
    this.syncMode(this.mode);
  }
  clear() {
    this.renderer.setRenderTarget(this.a);
    this.renderer.clear();
    this.renderer.setRenderTarget(this.b);
    this.renderer.clear();
    this.neon.clear(this.renderer);
    this.renderer.setRenderTarget(null);
  }
  select(id: string) {
    const active = this.modules.find((module) => module.id === id);
    if (!active || this.mode === "disposed") return;
    const version = ++this.selectionVersion;
    this.canvas.dataset.preparingScene = id;
    const commit = () => {
      if (version !== this.selectionVersion || this.mode === "disposed") return;
      this.settings.scene = id;
      delete this.canvas.dataset.preparingScene;
      this.resetAdaptation();
      this.recoveryDelay = 30;
      // Keep the displayed frame until the new scene draws. Clearing here can
      // expose a black canvas while its first frame is being prepared.
    };
    if (active.prepare) {
      return active.prepare(this.renderer).then(commit, (error: unknown) => {
        if (version !== this.selectionVersion || this.mode === "disposed")
          return;
        delete this.canvas.dataset.preparingScene;
        this.onError?.(`Unable to prepare visualizer: ${String(error)}`);
      });
    } else commit();
  }
  private adapt(frameDelta: number) {
    if (this.exporting) return;
    if (!this.settings.autoQuality) return;
    this.qualityTime += frameDelta;
    this.qualityFrames++;
    if (this.qualityTime < 2) return;
    const fps = this.qualityFrames / this.qualityTime;
    this.recoveryTime = fps > 57 ? this.recoveryTime + this.qualityTime : 0;
    let scale = this.adaptiveScale;
    if (fps < 48) {
      scale = Math.max(
        this.stats.softwareGPU ? 0.55 : 0.65,
        scale * Math.max(0.75, Math.sqrt(fps / 55)),
      );
      // Back off repeated failed quality probes on expensive scenes.
      if (scale < this.adaptiveScale)
        this.recoveryDelay = Math.min(120, this.recoveryDelay * 1.5);
    } else if (this.recoveryTime > this.recoveryDelay) {
      scale = Math.min(1, scale * 1.08);
      this.recoveryTime = 0;
    }
    this.qualityTime = 0;
    this.qualityFrames = 0;
    if (Math.abs(scale - this.adaptiveScale) > 0.015) {
      this.adaptiveScale = scale;
      this.resize();
    }
  }
  // Application-owned frame paths reuse all objects, typed arrays, vectors and callbacks.
  private tick = (now: number) => {
    this.frameId = 0;
    if (this.mode !== "realtime") return;
    const frameDelta = this.previous ? (now - this.previous) / 1000 : 1 / 60;
    const dt = Math.min(frameDelta, 0.05);
    this.previous = now;
    this.elapsed += frameDelta;
    const audio = this.audio.update(this.elapsed, dt);
    // Canvas size assignments clear its drawing buffer. Resize before drawing
    // so the browser never presents the cleared buffer between frames.
    this.adapt(frameDelta);
    this.renderFrame(audio, this.elapsed, dt);
    this.frames++;
    this.statsTime += frameDelta;
    if (this.statsTime > 0.25) {
      this.stats.fps = Math.round(this.frames / this.statsTime);
      this.frames = 0;
      this.statsTime = 0;
      this.onStats?.();
    }
    if (this.mode === "realtime") {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };
  renderFrame(audio: AudioFrameData, time: number, dt: number) {
    if (this.mode === "disposed" || this.mode === "context_lost")
      throw new Error("Graphics unavailable during export.");
    let active = this.modules[0];
    for (let i = 0; i < this.modules.length; i++)
      if (this.modules[i].id === this.settings.scene) active = this.modules[i];
    const overlayActive = this.settings.overlay && active.id !== "neon";
    if (overlayActive && !this.wasOverlayActive) {
      this.neon.clear(this.renderer);
    }
    this.wasOverlayActive = overlayActive;
    active.update(audio, time, dt);
    this.neon.layered = false;
    let read: T.WebGLRenderTarget;
    if (active.id === "neon") read = this.neon.renderFeedback(this.renderer);
    else {
      active.render(this.renderer, this.a, this.b);
      read = this.a;
    }
    let overlay: T.WebGLRenderTarget | null = null;
    if (overlayActive) {
      this.neon.layered = true;
      this.neon.update(audio, time, dt);
      if (this.settings.postFX) {
        overlay = this.neon.renderFeedback(this.renderer);
      } else {
        this.neon.render(this.renderer, this.b, read);
        read = this.b;
      }
    }
    if (this.settings.postFX) {
      this.renderPath =
        active.id === "neon"
          ? "neon_post"
          : overlayActive
            ? "scene_overlay_fused_post"
            : "scene_post";
      this.post.update(audio, time, dt);
      this.post.renderToScreen(this.renderer, read, overlay);
    } else {
      this.renderPath =
        active.id === "neon"
          ? "neon_raw"
          : overlayActive
            ? "scene_overlay_raw"
            : "scene_raw";
      this.output.material.uniforms.image.value = read.texture;
      this.output.material.uniforms.raw.value = 1;
      this.output.render(this.renderer, null);
    }
    this.canvas.dataset.renderPath = this.renderPath;
  }
  dispose() {
    this.syncMode("disposed");
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.visibility);
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.contextRestored,
    );
    for (let i = 0; i < this.modules.length; i++) this.modules[i].dispose();
    this.post.dispose();
    this.a.dispose();
    this.b.dispose();
    this.output.dispose();
    this.renderer.dispose();
    this.audio.dispose();
  }
}
