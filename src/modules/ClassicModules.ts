import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { common, FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";

const classic =
  common +
  `
uniform float uIntensity,uGain,uHue;
float trace(float d){float px=1.5/uResolution.y;return 1.-smoothstep(px,px*2.,d)+.3*exp(-d*110.);}
vec3 ink(float x){return palette(x+uHue)*uIntensity;}
`;

const spectrum =
  classic +
  `
void main(){
 vec2 p=vUv; vec3 col=vec3(.003,.006,.009);
 float x=clamp((p.x-.08)/.84,0.,.9999);
 float band=floor(x*48.); float level=clamp(fft((band+.5)/48.)*uGain,0.,1.);
 float y=(p.y-.18)/.65;
 float bar=step(.08,p.x)*step(p.x,.92)*step(0.,y)*step(y,level);
 float cell=step(.13,fract(x*48.))*step(.13,fract(y*32.));
 vec3 color=mix(vec3(.08,1.,.3),vec3(1.,.12,.03),smoothstep(.35,1.,y));
 col+=color*bar*cell*uIntensity;
 col+=ink(.3)*trace(abs(p.y-.18))*.12*step(.08,p.x)*step(p.x,.92);
 gl_FragColor=vec4(col,1.);
}`;

const scope =
  classic +
  `
void main(){
 vec2 p=vUv; vec3 col=vec3(.002,.008,.006);
 vec2 grid=abs(fract(p*vec2(16.,10.)+.5)-.5)/fwidth(p*vec2(16.,10.));
 col+=vec3(.03,.12,.075)*(1.-smoothstep(.3,1.,min(grid.x,grid.y)));
 // Sample neighboring waveform points and draw segments, including steep transients.
 float x=p.x*511.; float i=floor(x);
 vec2 a=vec2(i/511.,.5+wave(i/511.)*.36*uGain);
 vec2 b=vec2(min(i+1.,511.)/511.,.5+wave(min(i+1.,511.)/511.)*.36*uGain);
 vec2 ab=b-a; float h=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-8),0.,1.);
 col+=ink(.12)*trace(length(p-a-ab*h));
 gl_FragColor=vec4(col,1.);
}`;

const lissajous =
  classic +
  `
vec2 point(float s){return vec2(wave(s),wave(fract(s+.19)))*.32*uGain;}
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 vec3 col=vec3(.003,.006,.008); float d=10.;
 float bound=.32*uGain+.055;
 if(abs(p.x)<bound && abs(p.y)<bound){
  vec2 a=point(0.);
  for(int i=1;i<128;i++){
   vec2 b=point(float(i)*(1./127.)); vec2 ab=b-a;
   float h=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-8),0.,1.);
   d=min(d,length(p-a-ab*h)); a=b;
  }
  col+=ink(.35)*trace(d);
 }
 col+=ink(.35)*.045*exp(-min(abs(p.x),abs(p.y))*350.);
 gl_FragColor=vec4(col,1.);
}`;

const waterfall =
  classic +
  `
void main(){
 vec2 p=clamp((vUv-.06)/.88,0.,1.);
 float x=p.x*p.x*(.15+.85*p.x);
 float power=clamp(texture2D(uAudioHistoryTexture,vec2(x,1.-p.y)).r*uGain,0.,1.);
 vec3 cold=vec3(.005,.012,.05);
 float coldCut=smoothstep(0.,.18,power);
 float boost=pow(power,1.15);
 vec3 color=mix(cold,palette(.65-power*.65+uHue)*boost*1.8,coldCut);
 color*=uIntensity;
 float mask=step(.06,vUv.x)*step(vUv.x,.94)*step(.06,vUv.y)*step(vUv.y,.94);
 gl_FragColor=vec4(mix(vec3(.002,.004,.009),color,mask),1.);
}`;

const starfield =
  classic +
  `
uniform vec4 uStars[64];
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 vec3 col=vec3(.002,.003,.009);
 for(int i=0;i<64;i++){
  vec4 s=uStars[i]; float z=fract(s.z-uTime*.22);
  float depth=.12+z*2.;
  vec2 pos=s.xy/depth;
  vec2 tail=s.xy/(depth+.05+uBass*.09*uGain);
  vec2 p0=min(pos,tail)-.03; vec2 p1=max(pos,tail)+.03;
  if(p.x>=p0.x && p.x<=p1.x && p.y>=p0.y && p.y<=p1.y){
   vec2 ab=tail-pos; float h=clamp(dot(p-pos,ab)/max(dot(ab,ab),1e-8),0.,1.);
   float d=length(p-pos-ab*h);
   float fade=smoothstep(0.,.12,z)*(1.-smoothstep(.8,1.,z));
   col+=mix(vec3(.7,.82,1.),palette(float(i)*.017+uHue),.35)*trace(d)*fade
     *(.35+fft(s.w)*uGain)*uIntensity;
  }
 }
 gl_FragColor=vec4(col,1.);
}`;

abstract class ClassicModule extends ShaderModule {
  params = { intensity: 1.2, gain: 1, hue: 0 };
  protected abstract readonly fragment: string;
  private readonly extra = {
    uIntensity: { value: 1 },
    uGain: { value: 1 },
    uHue: { value: 0 },
  };
  protected getExtraUniforms(): Record<string, T.IUniform> {
    return {};
  }
  init(_renderer: T.WebGLRenderer, width: number, height: number) {
    this.pass = new FullscreenPass(this.fragment, {
      ...this.uniforms,
      ...this.extra,
      ...this.getExtraUniforms(),
    });
    this.resize(width, height);
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uGain.value = this.params.gain;
    this.extra.uHue.value = this.params.hue;
    if (this.id === "waterfall") audio.uAudioHistoryTexture.needsUpdate = true;
  }
}
export class ClassicSpectrumModule extends ClassicModule {
  readonly id = "classic-spectrum";
  readonly name = "Classic equalizer";
  protected readonly fragment = spectrum;
}
export class OscilloscopeModule extends ClassicModule {
  readonly id = "oscilloscope";
  readonly name = "Classic oscilloscope";
  protected readonly fragment = scope;
}
export class LissajousModule extends ClassicModule {
  readonly id = "lissajous";
  readonly name = "Lissajous scope";
  protected readonly fragment = lissajous;
}
export class WaterfallModule extends ClassicModule {
  readonly id = "waterfall";
  readonly name = "Waterfall spectrogram";
  protected readonly fragment = waterfall;
}
export class StarfieldModule extends ClassicModule {
  readonly id = "starfield";
  readonly name = "Classic starfield";
  protected readonly fragment = starfield;
  private readonly stars = Array.from({ length: 64 }, (_, i) => {
    const k = i;
    const hash = (n: number) => {
      const s = Math.sin(n * 127.1) * 43758.5453;
      return s - Math.floor(s);
    };
    return new T.Vector4(
      hash(k + 17) * 2 - 1,
      hash(k + 139) * 2 - 1,
      hash(k + 3),
      hash(k + 55),
    );
  });
  protected override getExtraUniforms() {
    return { uStars: { value: this.stars } };
  }
}
