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
 float decay=pow(uPersistence,uDelta*60.);
 vec3 trail=texture2D(uFeedback,clamp(tuv,0.,1.)).rgb*decay;
 trail=mix(trail,trail.gbr,.003*uDelta*60.);
 float sector=PI/uSymmetry;
 float angle=abs(mod(a+sector,2.*sector)-sector);
 vec2 k=vec2(cos(angle),sin(angle))*r;
 float waveform=wave(clamp(k.x*.75+.2,0.,1.));float spectrum=fft(clamp(r*.65,0.,1.));
 // Pixel-aware filaments stay continuous as adaptive resolution changes, clamped across fold creases.
 float px=1./uResolution.y;
 float path=k.y-.12-waveform*(.055+uBass*.08)-.075*sin(k.x*11.-uTime*.6);
 float width=clamp(fwidth(path),1.2*px,6.*px);
 float ribbon=1.-smoothstep(.0015,.0015+width*1.5,abs(path));
 float halo=exp(-abs(path)*65.)*.14;
 float ring=r-(.29+.055*sin(a*uSymmetry+uTime*.35)+spectrum*.12);
 float ringWidth=clamp(fwidth(ring),px,5.*px);
 float orbit=1.-smoothstep(.001,.001+ringWidth*1.5,abs(ring));
 // History is a moving spectral fabric behind the waveform ribbons, mapped seamlessly per sector.
 float history=texture2D(uAudioHistoryTexture,vec2(clamp(angle/sector,0.,1.),clamp(r*.55,0.,1.))).r;
 float threads=pow(max(0.,sin(r*75.-uTime*.8+history*5.)),18.)*(.025+history*.12);
 vec3 color=palette(r*.65+angle*.35+uTime*.018+uHue);
 vec3 fresh=(color*(ribbon+halo)+palette(.5-r*.4+uHue)*orbit*.5+color*threads)*uIntensity*(.35+uRms*1.1);
 // Balance injection against decay so trails preserve color and negative space.
 vec3 result=trail+fresh*(1.-decay)*3.;
 result*=1.-smoothstep(.55,1.15,r)*.045;
 // Keep the base scene out of the feedback loop; composite it only on output.
 gl_FragColor=vec4(result,1.);
}`;
export class NeonFeedbackModule extends ShaderModule {
  readonly id = "neon";
  readonly name = "Neon feedback";
  params = {
    persistence: 0.91,
    symmetry: 6,
    intensity: 1.25,
    warp: 0.3,
    hue: 0.0,
  };
  private renderer!: T.WebGLRenderer;
  private a!: T.WebGLRenderTarget;
  private b!: T.WebGLRenderTarget;
  private copy!: FullscreenPass;
  private readonly extra = {
    uFeedback: { value: null as T.Texture | null },
    uPersistence: { value: 0.91 },
    uSymmetry: { value: 6 },
    uIntensity: { value: 1.25 },
    uWarp: { value: 0.3 },
    uHue: { value: 0 },
  };
  layered = false;
  init(r: T.WebGLRenderer, w: number, h: number) {
    this.renderer = r;
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
    a.uAudioHistoryTexture.needsUpdate = true;
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
    if (!this.a || !this.b) return;
    if (this.a.width === w && this.a.height === h) return;
    // Resample existing HDR feedback into the resized target so adaptive scaling never flashes black.
    if (this.renderer && this.a.width > 1 && this.a.height > 1) {
      this.b.setSize(w, h);
      this.copy.material.uniforms.image.value = this.a.texture;
      this.copy.material.uniforms.base.value = this.a.texture;
      this.copy.material.uniforms.layer.value = 0;
      this.copy.render(this.renderer, this.b);
      this.renderer.setRenderTarget(null);
      this.a.setSize(w, h);
      const tmp = this.a;
      this.a = this.b;
      this.b = tmp;
    } else {
      this.a.setSize(w, h);
      this.b.setSize(w, h);
    }
  }
  override dispose() {
    super.dispose();
    this.a.dispose();
    this.b.dispose();
    this.copy.dispose();
  }
}
