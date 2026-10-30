import * as T from "three";
import { AudioEngine } from "../audio/AudioEngine";
import type { AudioFrameData, IVisualModule } from "./types";
import { target, FullscreenPass } from "../shaders/shared";
import { NeonFeedbackModule } from "../modules/NeonFeedbackModule";
import {
  AuroraRibbonsModule,
  PrismaticDriftModule,
} from "../modules/ConsoleLightModules";
import { RealisticFerrofluidModule } from "../modules/RealisticFerrofluidModule";
import { MasterPostFXModule } from "../modules/MasterPostFXModule";
export class VisualizerHost {
  readonly renderer: T.WebGLRenderer;
  readonly modules: IVisualModule[] = [
    new NeonFeedbackModule(),
    new AuroraRibbonsModule(),
    new PrismaticDriftModule(),
    new RealisticFerrofluidModule(),
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
  private readonly pixelBudget: number;
  private a: T.WebGLRenderTarget;
  private b: T.WebGLRenderTarget;
  private readonly output: FullscreenPass;
  private previous = 0;
  private elapsed = 0;
  private frameId = 0;
  private frames = 0;
  private statsTime = 0;
  private disposed = false;
  private lost = false;
  onStats: (() => void) | null = null;
  exporting = false;
  onError: ((message: string) => void) | null = null;
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
    this.b = target(1, 1, true);
    this.output = new FullscreenPass(
      `varying vec2 vUv;uniform sampler2D image;uniform float raw;void main(){vec3 c=texture2D(image,vUv).rgb;if(raw>.5)c=pow(c/(1.+c),vec3(1./2.2));gl_FragColor=vec4(c,1.);}`,
      { image: { value: null }, raw: { value: 0 } },
    );
    for (let i = 0; i < this.modules.length; i++)
      this.modules[i].init(this.renderer, 1, 1);
    this.post.init(this.renderer, 1, 1);
    this.resize();
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.visibility);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    canvas.addEventListener("webglcontextrestored", this.contextRestored);
    this.frameId = requestAnimationFrame(this.tick);
  }
  private contextLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    cancelAnimationFrame(this.frameId);
    this.onError?.("Graphics context lost. Waiting for the GPU to recover…");
  };
  private contextRestored = () => {
    window.location.reload();
  };
  private visibility = () => {
    if (document.hidden) cancelAnimationFrame(this.frameId);
    else if (!this.disposed && !this.lost && !this.exporting) {
      this.previous = 0;
      this.frameId = requestAnimationFrame(this.tick);
    }
  };
  resize = () => {
    if (this.exporting) return;
    // CSS dimensions, not devicePixelRatio: HDR multi-pass rendering at 4K/HiDPI
    // silently consumed millions of extra fragments on every pass.
    const budget = this.settings.autoQuality ? this.pixelBudget : 1920 * 1080;
    const scale =
      Math.min(
        this.settings.quality,
        Math.sqrt(budget / (window.innerWidth * window.innerHeight)),
      ) * (this.settings.autoQuality ? this.adaptiveScale : 1);
    const w = Math.max(1, Math.floor(window.innerWidth * scale)),
      h = Math.max(1, Math.floor(window.innerHeight * scale));
    this.setSize(w, h);
  };
  private setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.stats.width = w;
    this.stats.height = h;
    this.a.setSize(w, h);
    this.b.setSize(w, h);
    for (let i = 0; i < this.modules.length; i++) this.modules[i].resize(w, h);
    this.post.resize(w, h);
    this.clear();
  }
  beginOfflineExport(width: number, height: number) {
    this.exporting = true;
    cancelAnimationFrame(this.frameId);
    this.setSize(width, height);
  }
  endOfflineExport() {
    this.exporting = false;
    this.previous = 0;
    this.resize();
    if (!this.disposed && !this.lost && !document.hidden)
      this.frameId = requestAnimationFrame(this.tick);
  }
  clear() {
    this.renderer.setRenderTarget(this.a);
    this.renderer.clear();
    this.renderer.setRenderTarget(this.b);
    this.renderer.clear();
    (this.modules[0] as NeonFeedbackModule).clear(this.renderer);
    this.renderer.setRenderTarget(null);
  }
  select(id: string) {
    this.settings.scene = id;
    this.clear();
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
    if (fps < 48)
      scale = Math.max(
        this.stats.softwareGPU ? 0.55 : 0.65,
        scale * Math.max(0.75, Math.sqrt(fps / 55)),
      );
    else if (this.recoveryTime > 8) {
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
  private swap() {
    const temp = this.a;
    this.a = this.b;
    this.b = temp;
  }
  // Application-owned frame paths reuse all objects, typed arrays, vectors and callbacks.
  private tick = (now: number) => {
    if (this.disposed || this.lost) return;
    const frameDelta = this.previous ? (now - this.previous) / 1000 : 1 / 60;
    const dt = Math.min(frameDelta, 0.05);
    this.previous = now;
    this.elapsed += frameDelta;
    const audio = this.audio.update(this.elapsed, dt);
    this.renderFrame(audio, this.elapsed, dt);
    this.frames++;
    this.statsTime += frameDelta;
    if (this.statsTime > 0.25) {
      this.stats.fps = Math.round(this.frames / this.statsTime);
      this.frames = 0;
      this.statsTime = 0;
      this.onStats?.();
    }
    this.adapt(frameDelta);
    this.frameId = requestAnimationFrame(this.tick);
  };
  renderFrame(audio: AudioFrameData, time: number, dt: number) {
    if (this.disposed || this.lost)
      throw new Error("Graphics unavailable during export.");
    let active = this.modules[0];
    for (let i = 0; i < this.modules.length; i++)
      if (this.modules[i].id === this.settings.scene) active = this.modules[i];
    active.update(audio, time, dt);
    (this.modules[0] as NeonFeedbackModule).layered = false;
    let read: T.WebGLRenderTarget;
    if (active.id === "neon")
      read = (active as NeonFeedbackModule).renderFeedback(this.renderer);
    else {
      active.render(this.renderer, this.b, this.a);
      this.swap();
      read = this.a;
    }
    let overlay: T.WebGLRenderTarget | null = null;
    if (this.settings.overlay && active.id !== "neon") {
      const neon = this.modules[0] as NeonFeedbackModule;
      neon.layered = true;
      neon.update(audio, time, dt);
      if (this.settings.postFX) {
        overlay = neon.renderFeedback(this.renderer);
      } else {
        neon.render(this.renderer, this.b, read);
        this.swap();
        read = this.a;
      }
    }
    if (this.settings.postFX) {
      this.post.update(audio, time, dt);
      this.post.renderToScreen(this.renderer, read, overlay);
    } else {
      this.output.material.uniforms.image.value = read.texture;
      this.output.material.uniforms.raw.value = 1;
      this.output.render(this.renderer, null);
    }
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
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
