import * as T from "three";
import type { AudioFrameData, IVisualModule } from "../core/types";
import { audioUniforms, FullscreenPass } from "../shaders/shared";
export abstract class ShaderModule implements IVisualModule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract params: Record<string, any>;
  protected readonly uniforms = audioUniforms();
  protected pass!: FullscreenPass;
  abstract init(renderer: T.WebGLRenderer, width: number, height: number): void;
  update(a: AudioFrameData, t: number, dt: number) {
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
