import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { ShaderModule } from "./ShaderModule";
import { common, FullscreenPass } from "../shaders/shared";
import { simplex } from "../shaders/simplex";

const header =
  common +
  `
uniform float uIntensity,uHue,uWarp,uSymmetry,uTwist,uContours,uRelief;
uniform vec4 uShockwaves[12];
float glow(float d,float width){return exp(-abs(d)/max(width,1./uResolution.y));}
vec3 color(float h){return palette(h+uHue);}
`;

const bloom =
  header +
  `
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.)*2.;
 float t=uTime,r=length(p),a=atan(p.y,p.x)+t*.12;
 float segments=max(2.,floor(uSymmetry))*2.;
 float sector=2.*PI/segments;
 float fold=abs(mod(a+sector*.5,sector)-sector*.5);
 float petal=cos(fold*segments);
 float warp=(sin(r*8.-t*1.4)*.06+cos(fold*segments*2.+t)*.035)*uWarp;
 float radius=r*(1.+warp)/(1.+uSub*.14);
 vec3 col=color(radius*.13-t*.025)*.025;
 // Nested petal rings breathe independently, leaving dark gaps between luminous folds.
 for(int i=0;i<9;i++){
  float k=float(i),base=.13+k*.12;
  float undulation=sin(fold*segments*(1.+mod(k,3.))+t*.7+k)*(.018+uMid*.035)*uWarp;
  float ring=base+petal*(.022+k*.004)+undulation+uBass*.035;
  float d=radius-ring;
  float detail=.55+.45*cos(fold*segments*3.-t*1.6+k);
  float line=glow(d,.005+uTreble*.006);
  float body=glow(d,.024+uRms*.018);
  col+=color(k*.075+fold*.7-t*.035)*(line*1.25+body*.28)*(.55+detail*.5+fft(k/10.)*.6);
 }
 float lace=pow(max(0.,cos(radius*34.-t*2.+petal*3.)),12.);
 col+=color(radius*.25+.3)*lace*.16*exp(-r*.8)*(1.+uTreble);
 col+=color(.1)*exp(-r*9.)*(.3+uBeat*.65);
 col*=uIntensity*(.65+uRms*.7)*(1.-smoothstep(.9,1.85,r));
 gl_FragColor=vec4(col,1.);
}`;

const chrome =
  header +
  `
float surface(vec2 p){
 float t=uTime;
 p+=vec2(sin(p.y*3.+t*.6),cos(p.x*2.8-t*.5))*.22*uWarp;
 float r=length(p);
 return sin(p.x*4.+sin(p.y*3.-t)*1.4+t*.7)*.16
  +cos(p.y*5.-p.x*2.+t*.65)*.12
  +sin(r*13.-t*2.4)*( .035+uBass*.065);
}
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.)*2.4;
 float h=surface(p);
 vec2 dp=vec2(dFdx(p.x),dFdy(p.y));
 vec2 grad=vec2(dFdx(h),dFdy(h))/max(abs(dp),vec2(1e-5));
 vec3 n=normalize(vec3(grad,1.));
 vec3 reflected=reflect(vec3(0.,0.,-1.),n);
 float bands=.5+.5*sin(reflected.x*8.+reflected.y*5.+h*9.-uTime*.4);
 float strip=pow(bands,18.);
 float spec=pow(max(dot(n,normalize(vec3(-.5,.7,1.))),0.),48.);
 float fresnel=pow(1.-n.z,2.);
 vec3 metal=mix(vec3(.025,.035,.055),vec3(.48,.55,.65),smoothstep(.25,.8,bands));
 vec3 iridescence=color(reflected.y*.35+reflected.x*.2+h*.8+uTime*.018);
 vec3 col=metal*(.3+bands*.5)+iridescence*(.15+fresnel*.9+strip*.85);
 col+=vec3(.8,.95,1.)*(spec*1.5+strip*.4)*(1.+uTreble*.65);
 col+=color(length(p)*.25)*glow(sin(length(p)*11.-uTime*2.),.055)*uBeat*.2;
 col*=uIntensity*(.65+uRms*.5)*(1.-smoothstep(.8,2.3,length(p))*.65);
 gl_FragColor=vec4(col,1.);
}`;

const reactor =
  header +
  `
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.)*2.;
 float r=length(p),a=atan(p.y,p.x),t=uTime;
 vec3 col=vec3(.002,.006,.014);
 float core=.12+uSub*.055+uBeat*.025;
 float corona=core+sin(a*9.+t*2.)*(.006+uMid*.015)*uWarp;
 col+=color(.12+r*.3)*(glow(r-corona,.012)*2.+exp(-r*r/(core*core))*.75);
 // Segmented containment rings and waveform filaments surround the core.
 for(int i=0;i<5;i++){
  float k=float(i),rr=.27+k*.115+uBass*.025;
  float sampleX=.5+.5*sin(a+k);
  float wobble=wave(sampleX)*(.012+uMid*.025)*uWarp;
  float gates=smoothstep(.12,.3,abs(sin(a*(6.+k*2.)+t*(mod(k,2.)*2.-1.))));
  float ring=glow(r-rr-wobble,.004+uTreble*.003);
  col+=color(k*.09+t*.015)*(ring*(.4+gates)+glow(r-rr,.025)*.12);
 }
 // Retained beat events propagate outward; no free-running pseudo-beat rings.
 for(int i=0;i<12;i++){
  vec4 sw=uShockwaves[i];
  float d=r-sw.x;
  col+=color(sw.z+r*.1)*glow(d,.012+sw.w*.01)*sw.y*1.8;
 }
 float rays=pow(max(0.,cos(a*24.+t*.3)),20.)*exp(-r*4.);
 col+=color(.4)*rays*(.08+uBeat*.7);
 col+=color(.05)*exp(-r*5.)*(.08+uSub*.2);
 col*=uIntensity*(.7+uRms*.65)*(1.-smoothstep(1.,1.8,r));
 gl_FragColor=vec4(col,1.);
}`;

const tunnel =
  header +
  `
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.)*2.;
 float r=max(length(p),.018),a=atan(p.y,p.x),t=uTime;
 // Inverse-radius projection gives continuous faceted walls rather than discrete hoops.
 float depth=min(1./r,45.);
 float twist=a+depth*.18*uTwist+sin(depth*.35-t*.3)*.2*uWarp+t*.12;
 float sector=2.*PI/8.;
 float folded=mod(twist+sector*.5,sector)-sector*.5;
 float facet=cos(folded);
 float z=depth*facet-t*(1.4+uBass*.4);
 float angular=twist/sector;
 vec2 grid=vec2(angular,z*1.3);
 vec2 edge=abs(fract(grid+.5)-.5);
 vec2 aa=clamp(fwidth(grid),vec2(.008),vec2(.25));
 vec2 lines=1.-smoothstep(aa*.6,aa*1.8,edge);
 float fog=exp(-depth*.085)*smoothstep(.018,.13,r);
 float cell=floor(grid.y);
 float spectrum=fft(fract(abs(floor(angular))*.13+cell*.047));
 float panels=.5+.5*sin(z*2.+floor(angular)*1.7);
 float sheen=pow(max(0.,cos(folded*8.)),8.);
 vec3 tint=color(floor(angular)*.095+cell*.035+t*.02);
 vec3 col=tint*(.06+panels*.11+sheen*.12)*( .5+spectrum*.9);
 col+=color(z*.04+.25)*(lines.x*.85+lines.y*.65+lines.x*lines.y*.7);
 float pulse=pow(max(0.,sin(z*1.8+t*2.)),16.)*(.12+uBeat*.65);
 col+=color(.15+depth*.025)*pulse;
 col*=fog*uIntensity*(.65+uRms*.7);
 col+=color(.5)*exp(-r*22.)*(.08+uSub*.25);
 col*=1.-smoothstep(1.15,2.,r)*.6;
 gl_FragColor=vec4(col,1.);
}`;

const contours =
  header +
  simplex +
  `
float terrain(vec2 p,out vec2 flow){
 float t=uTime;
 vec2 drift=vec2(t*.16,-t*.11);
 vec2 q=rot(sin(t*.07)*.25)*p+drift;
 float w1=snoise(vec3(q*.62,t*.2+uBass*.18));
 float w2=snoise(vec3(q*.62+vec2(4.2,-3.1),t*.2+2.4-uMid*.15));
 flow=vec2(w1,w2)*(.42+uMid*.32+uBass*.18)*uWarp;
 vec2 wp=q+flow;
 float h1=snoise(vec3(wp*.78,t*.22))*(.66+uSub*.28+uBass*.26);
 float h2=snoise(vec3(wp*1.65+vec2(1.9,-2.7),t*.31))*.34*(.85+uMid*.38);
 float h3=snoise(vec3(wp*3.2-vec2(3.3,1.4),t*.44))*.15*(.7+uTreble*.58);
 float ridge=snoise(vec3(wp*1.15-flow*.6,t*.16-1.7))*(.18+uBeat*.16);
 float sampleU=clamp(.5+.45*sin(wp.x*.85+wp.y*.65+w1*1.2),0.,1.);
 float spec=fft(sampleU)*2.-1.;
 float wv=wave(clamp(.5+.4*cos(wp.y*.9-wp.x*.7+w2),0.,1.));
 return h1+h2+h3+ridge+(spec*.085+wv*.05)*(.4+uWarp*.45);
}
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.)*2.2;
 float r=length(p),t=uTime;
 vec2 flow;
 float h=terrain(p,flow);
 vec2 dp=max(abs(vec2(dFdx(p.x),dFdy(p.y))),vec2(1e-4));
 vec2 grad=vec2(dFdx(h),dFdy(h))/dp;
 vec3 n=normalize(vec3(-grad*(.85+uRelief*.75),1.));
 float density=5.5+max(.2,uContours)*5.5;
 float scaled=h*density;
 float dh=max(fwidth(scaled),1e-4);
 // Minor isolines and every-5th major index contours with screen-space anti-aliasing.
 float minorDist=abs(fract(scaled-.5)-.5)/dh;
 float minorLine=1.-smoothstep(.55,1.65,minorDist);
 float minorGlow=exp(-minorDist*.34);
 float majorScaled=scaled*.2;
 float dhMajor=max(fwidth(majorScaled),1e-4);
 float majorDist=abs(fract(majorScaled-.5)-.5)/dhMajor;
 float majorLine=1.-smoothstep(.85,2.05,majorDist);
 float majorGlow=exp(-majorDist*.22);
 float band=floor(scaled);
 float stepFract=smoothstep(0.,.18,fract(scaled))*(1.-smoothstep(.82,1.,fract(scaled)));
 float elev=clamp(h*.65+.5,0.,1.);
 float shade=clamp(dot(n,normalize(vec3(-.55,.65,1.1))),0.,1.);
 float rim=pow(clamp(1.-n.z,0.,1.),1.4);
 float hueBase=h*.38+band*.024+length(flow)*.18-t*.028;
 vec3 valley=vec3(.006,.01,.024);
 vec3 hypso=color(hueBase+atan(n.y,n.x)*.06);
 vec3 col=mix(valley,hypso*(.14+elev*.26),smoothstep(-.85,.95,h));
 col*=.55+shade*.65*uRelief+stepFract*.18;
 col+=color(hueBase+.12)*rim*(.22+uMid*.28)*uRelief;
 // Subtle warped cartographic survey grid in low-lying basins.
 vec2 grid=abs(fract((p+flow*.35)*1.6-.5)-.5)/max(fwidth((p+flow*.35)*1.6),vec2(1e-4));
 float graticule=1.-smoothstep(.7,1.8,min(grid.x,grid.y));
 col+=color(hueBase+.45)*graticule*.065*(1.-elev*.6);
 // Luminous minor and major contour isolines.
 vec3 minorCol=color(hueBase+.2+uBass*.1);
 vec3 majorCol=color(hueBase+.38+uBeat*.16);
 col+=minorCol*(minorLine*(.75+uMid*.55)+minorGlow*.18)*(0.65+elev*.55);
 col+=majorCol*(majorLine*(1.45+uTreble*.85+uBeat*.75)+majorGlow*(.38+uRms*.35));
 col+=vec3(.75,.92,1.)*majorLine*majorLine*(.28+uTreble*.55+uBeat*.4);
 col*=uIntensity*(.65+uRms*.65)*(1.-smoothstep(1.05,2.05,r)*.68);
 gl_FragColor=vec4(col,1.);
}`;

abstract class PsychedelicModule extends ShaderModule {
  protected abstract readonly fragment: string;
  abstract params: {
    speed: number;
    intensity: number;
    hue: number;
    warp: number;
    symmetry?: number;
    twist?: number;
    contours?: number;
    relief?: number;
  };
  private phase = 0;
  private nextShockwave = 0;
  private readonly shockwaves = Array.from(
    { length: 12 },
    () => new T.Vector4(),
  );
  private readonly extra = {
    uIntensity: { value: 1 },
    uHue: { value: 0 },
    uWarp: { value: 1 },
    uSymmetry: { value: 8 },
    uTwist: { value: 1 },
    uContours: { value: 1.2 },
    uRelief: { value: 1 },
    uShockwaves: { value: this.shockwaves },
  };
  init(_renderer: T.WebGLRenderer, width: number, height: number) {
    this.pass = new FullscreenPass(this.fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.resize(width, height);
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    this.phase += dt * this.params.speed;
    this.uniforms.uTime.value = this.phase;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uHue.value = this.params.hue;
    this.extra.uWarp.value = this.params.warp;
    this.extra.uSymmetry.value = this.params.symmetry ?? 8;
    this.extra.uTwist.value = this.params.twist ?? 1;
    this.extra.uContours.value = this.params.contours ?? 1.2;
    this.extra.uRelief.value = this.params.relief ?? 1;
    if (this.id !== "pulse-reactor") return;
    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      sw.x += dt * (0.65 + sw.w * 0.55) * this.params.speed;
      sw.y = Math.max(0, sw.y - dt * 0.6);
    }
    if (audio.kick) {
      this.shockwaves[this.nextShockwave].set(
        0.14,
        0.65 + audio.beat * 0.35,
        this.phase * 0.035,
        audio.bass,
      );
      this.nextShockwave = (this.nextShockwave + 1) % this.shockwaves.length;
    }
  }
}

export class PsychedelicBloomModule extends PsychedelicModule {
  readonly id = "psychedelic-bloom";
  readonly name = "Psychedelic Bloom";
  protected readonly fragment = bloom;
  params = { speed: 0.85, intensity: 1.2, hue: 0.04, warp: 1, symmetry: 8 };
}
export class AcidChromeModule extends PsychedelicModule {
  readonly id = "acid-chrome";
  readonly name = "Acid Chrome";
  protected readonly fragment = chrome;
  params = { speed: 0.8, intensity: 1.15, hue: 0.18, warp: 1.1 };
}
export class PulseReactorModule extends PsychedelicModule {
  readonly id = "pulse-reactor";
  readonly name = "Pulse Reactor";
  protected readonly fragment = reactor;
  params = { speed: 1, intensity: 1.3, hue: 0.45, warp: 1 };
}
export class PrismaticTunnelModule extends PsychedelicModule {
  readonly id = "prismatic-tunnel";
  readonly name = "Prismatic Tunnel";
  protected readonly fragment = tunnel;
  params = { speed: 0.85, intensity: 1.25, hue: 0.65, warp: 1, twist: 1 };
}
export class TopographicContoursModule extends PsychedelicModule {
  readonly id = "topographic-contours";
  readonly name = "Topographic Contours";
  protected readonly fragment = contours;
  params = {
    speed: 0.8,
    intensity: 1.25,
    hue: 0.28,
    warp: 1.15,
    contours: 1.2,
    relief: 1,
  };
}
