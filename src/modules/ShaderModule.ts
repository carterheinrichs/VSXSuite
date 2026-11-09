import * as T from "three";
import type { AudioFrameData, IVisualModule } from "../core/types";
import { audioUniforms, FullscreenPass } from "../shaders/shared";
export abstract class ShaderModule implements IVisualModule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract params: Record<string, any>;
  protected readonly uniforms = audioUniforms();
  protected pass!: FullscreenPass;
  protected lastTime = -1;
  abstract init(renderer: T.WebGLRenderer, width: number, height: number): void;
  reset() {
    this.lastTime = -1;
    this.onReset();
  }
  protected onReset() {}
  update(a: AudioFrameData, t: number, dt: number) {
    if (t <= this.lastTime || this.lastTime < 0) {
      this.onReset();
    }
    this.lastTime = t;
    const u = this.uniforms;
    u.uTime.value = t;
    u.uDelta.value = dt;
    u.uBass.value = a.bass;
    u.uSub.value = a.subBass;
    u.uMid.value = a.mid;
    u.uTreble.value = a.treble;
    u.uBeat.value = a.beat;
    u.uRms.value = a.rms;
    u.uAudioTexture.value = a.uAudioTexture;
    u.uAudioHistoryTexture.value = a.uAudioHistoryTexture;
  }
  render(
    r: T.WebGLRenderer,
    w: T.WebGLRenderTarget,
    read: T.WebGLRenderTarget,
  ) {
    this.uniforms.uPrevious.value = read.texture;
    this.pass.render(r, w);
  }
  resize(w: number, h: number) {
    this.uniforms.uResolution.value.set(w, h);
  }
  dispose() {
    this.pass.dispose();
  }
}
