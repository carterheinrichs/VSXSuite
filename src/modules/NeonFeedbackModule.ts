import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { ShaderModule } from "./ShaderModule";
import { common, FullscreenPass, target } from "../shaders/shared";
const fragment =
  common +
  `
uniform sampler2D uFeedback;uniform float uPersistence,uSymmetry,uIntensity,uWarp,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);float r=length(p);float a=atan(p.y,p.x);
 // Advect the previous HDR frame through an audio-driven vortex.
 vec2 q=p*exp(-uDelta*(.10+uBass*.16));q=rot(uDelta*(.08+uMid*.4+uWarp*sin(r*5.-uTime*.3)))*q;
 vec2 tuv=q/vec2(uResolution.x/uResolution.y,1.)+.5;
 vec3 trail=texture2D(uFeedback,tuv).rgb*pow(uPersistence,uDelta*60.);
 trail=mix(trail,trail.gbr,.003*uDelta*60.);
 float angle=abs(mod(a+PI/uSymmetry,2.*PI/uSymmetry)-PI/uSymmetry);
 vec2 k=vec2(cos(angle),sin(angle))*r;
 float waveform=wave(fract(k.x*.75+.2));float spectrum=fft(clamp(r*.23,0.,1.));
 float ribbon=exp(-abs(k.y-.15-waveform*(.12+uBass*.15)-.09*sin(k.x*9.-uTime))*(170./(1.+uBeat)));
 float orbit=exp(-abs(r-(.32+.09*sin(a*uSymmetry+uTime*.5)+spectrum*.28)) * 130.);
 // History is a moving spectral fabric behind the waveform ribbons.
 float history=texture2D(uAudioHistoryTexture,vec2(fract(angle/PI*2.),clamp(r*.55,0.,1.))).r;
 float threads=pow(max(0.,sin(r*55.-uTime*2.+history*9.)),22.)*history*.15;
 vec3 color=palette(r*.28+a*.06+uTime*.025+uHue);
 vec3 fresh=color*(ribbon*2.8+orbit*.8+threads)*uIntensity*(.2+uRms*2.);
 vec3 result=min(trail+fresh*uDelta*30.,vec3(18.));
 // Keep the base scene out of the feedback loop; composite it only on output.
 gl_FragColor=vec4(result,1.);
}`;
export class NeonFeedbackModule extends ShaderModule {
  readonly id = "neon";
  readonly name = "Neon feedback";
  params = {
    persistence: 0.965,
    symmetry: 6,
    intensity: 1.25,
    warp: 0.3,
    hue: 0.0,
  };
  private a!: T.WebGLRenderTarget;
  private b!: T.WebGLRenderTarget;
  private copy!: FullscreenPass;
  private readonly extra = {
    uFeedback: { value: null as T.Texture | null },
    uPersistence: { value: 0.965 },
    uSymmetry: { value: 6 },
    uIntensity: { value: 1.25 },
    uWarp: { value: 0.3 },
    uHue: { value: 0 },
  };
  layered = false;
  init(r: T.WebGLRenderer, w: number, h: number) {
    this.pass = new FullscreenPass(fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.copy = new FullscreenPass(
      "varying vec2 vUv;uniform sampler2D image,base;uniform float layer;void main(){vec3 c=texture2D(image,vUv).rgb;vec3 b=texture2D(base,vUv).rgb;gl_FragColor=vec4(layer>.5?b+c*.22:c,1.);}",
      { image: { value: null }, base: { value: null }, layer: { value: 0 } },
    );
    this.a = target(w, h);
    this.b = target(w, h);
    this.resize(w, h);
    this.clear(r);
  }
  clear(r: T.WebGLRenderer) {
    r.setRenderTarget(this.a);
    r.clear();
    r.setRenderTarget(this.b);
    r.clear();
    r.setRenderTarget(null);
  }
  override update(a: AudioFrameData, t: number, dt: number) {
    super.update(a, t, dt);
    this.extra.uPersistence.value = this.params.persistence;
    this.extra.uSymmetry.value = this.params.symmetry;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uWarp.value = this.params.warp;
    this.extra.uHue.value = this.params.hue;
  }
  override render(
    r: T.WebGLRenderer,
    w: T.WebGLRenderTarget,
    read: T.WebGLRenderTarget,
  ) {
    this.renderFeedback(r);
    this.copy.material.uniforms.image.value = this.a.texture;
    this.copy.material.uniforms.base.value = read.texture;
    this.copy.material.uniforms.layer.value = this.layered ? 1 : 0;
    this.copy.render(r, w);
  }
  // Base scenes can feed this HDR target straight to post FX, avoiding a copy.
  renderFeedback(r: T.WebGLRenderer): T.WebGLRenderTarget {
    this.extra.uFeedback.value = this.a.texture;
    this.pass.render(r, this.b);
    const tmp = this.a;
    this.a = this.b;
    this.b = tmp;
    return this.a;
  }
  override resize(w: number, h: number) {
    super.resize(w, h);
    this.a?.setSize(w, h);
    this.b?.setSize(w, h);
  }
  override dispose() {
    super.dispose();
    this.a.dispose();
    this.b.dispose();
    this.copy.dispose();
  }
}
