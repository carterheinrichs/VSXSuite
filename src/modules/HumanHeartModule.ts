import type * as T from "three";
import type { AudioFrameData } from "../core/types";
import { FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";
import { fragment, heartLoopUniforms } from "./HumanHeartShader";
import { HeartWorkerPass } from "./HeartWorkerPass";

export class HumanHeartModule extends ShaderModule {
  private realtime?: HeartWorkerPass;
  readonly id = "human-heart";
  readonly name = "Human Heart";
  params = {
    speed: 1,
    intensity: 1.1,
    hue: 0,
    reactivity: 1,
    vessels: 1,
    turn: 1,
    cutaway: true,
  };
  private readonly extra = {
    uIntensity: { value: 1.1 },
    uHue: { value: 0 },
    uReactivity: { value: 1 },
    uVessels: { value: 1 },
    uTurn: { value: 1 },
    uCutaway: { value: 1 },
    uHeartPhase: { value: -1 },
  };
  init(_renderer: T.WebGLRenderer, width: number, height: number) {
    this.pass = new FullscreenPass(fragment, {
      ...this.uniforms,
      ...heartLoopUniforms(),
      ...this.extra,
    });
    this.resize(width, height);
  }
  private workerFrame() {
    const values: Record<string, number> = {};
    for (const [name, uniform] of Object.entries({
      ...this.uniforms,
      ...this.extra,
    })) {
      if (typeof uniform.value === "number") values[name] = uniform.value;
    }
    const rawW = this.uniforms.uResolution.value.x || 1;
    const rawH = this.uniforms.uResolution.value.y || 1;
    const scale = Math.min(1, Math.sqrt((480 * 270) / (rawW * rawH)));
    const width = Math.max(1, Math.round(rawW * scale));
    const height = Math.max(1, Math.round(rawH * scale));
    return {
      width,
      height,
      uniforms: values,
    };
  }
  override prepare(_renderer: T.WebGLRenderer) {
    this.realtime ??= new HeartWorkerPass(this.workerFrame());
    return this.realtime.ready;
  }
  renderRealtime(renderer: T.WebGLRenderer, output: T.WebGLRenderTarget) {
    this.realtime!.render(renderer, output, this.workerFrame());
  }
  override dispose() {
    this.realtime?.dispose();
    super.dispose();
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    this.uniforms.uTime.value = time * this.params.speed;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uHue.value = this.params.hue;
    this.extra.uReactivity.value = this.params.reactivity;
    this.extra.uVessels.value = this.params.vessels;
    this.extra.uTurn.value = this.params.turn;
    this.extra.uCutaway.value = this.params.cutaway ? 1 : 0;
    this.extra.uHeartPhase.value =
      this.params.reactivity > 0 && Number.isFinite(audio.beatPhase)
        ? audio.beatPhase!
        : -1;
  }
}
