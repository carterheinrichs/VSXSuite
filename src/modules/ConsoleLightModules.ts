import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { ShaderModule } from "./ShaderModule";
import { common, FullscreenPass } from "../shaders/shared";

// Original console-era inspired scenes: layered light, saturated color and slow flight.
const ribbons =
  common +
  `
uniform float uIntensity,uSpread,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 p=rot(.12*sin(t*.13))*p;
 vec3 col=vec3(.004,.007,.018);
 float edgeSharp=min(180.,.85*uResolution.y);
 float baseEnergy=(.45+uRms*.85)*uIntensity;
 // Back-to-front translucent curtains with independently moving folds.
 for(int i=0;i<9;i++){
  float k=float(i), depth=k*.125;
  float x=p.x*(1.+depth*.35);
  float center=sin(x*2.1+t*.24+k*.54)*(.18+uSpread*.12)
    +sin(x*4.3-t*.18+k*.7)*.055+(depth-.5)*.32;
  center+=wave(clamp(x*.24+.5,0.,1.))*(.025+uBass*.055);
  float d=p.y-center;
  float width=.018+depth*.018+uMid*.012;
  float body=exp(-d*d/(width*width));
  float edge=exp(-abs(d-width*.6)*edgeSharp);
  float halo=exp(-abs(d)*12.);
  float pleats=.6+.4*sin(x*19.+k*2.+t*.35+sin(x*5.+t*.2)*2.);
  vec3 color=palette(depth*.28+x*.12+t*.012+uHue);
  col+=color*(body*(.25+pleats*.6)+edge*.5+halo*.045)
    *(baseEnergy+fft(depth*.6)*.4*uIntensity);
 }
 col+=palette(uHue+.18)*.025/(.12+length(p-vec2(.45*sin(t*.1),0.)));
 col*=1.-smoothstep(.35,1.4,length(p))*.8;
 gl_FragColor=vec4(col,1.);
}`;

const drift =
  common +
  `
uniform float uIntensity,uTwist,uHue;
uniform vec4 uHoops[28];
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 vec3 col=vec3(.003,.005,.015);
 float t=uTime;
 float px=1.3/uResolution.y;
 float energy=uIntensity*(.5+uRms+uBeat*.3);
 float bassScale=1.+uBass*.08;
 // Nested perspective hoops travel toward the camera; per-hoop transforms are precomputed on CPU.
 for(int i=0;i<28;i++){
  float z=fract(float(i)*(1./28.)-t*.055);
  float size=.035+z*z*1.65;
  vec4 h=uHoops[i];
  vec2 d0=p-h.xy;
  float r=length(d0);
  // Skip hoops whose glow footprint cannot reach this pixel.
  if(abs(r-size)<.16+size*.45){
   vec2 q=vec2(h.z*d0.x-h.w*d0.y,h.w*d0.x+h.z*d0.y);
   float angle=atan(q.y,q.x);
   float shape=1.+.13*cos(angle*5.+(1.-z)*5.+t*.2);
   float spectrum=fft(abs(angle)*(1./PI));
   float d=r-size*shape*bassScale-spectrum*.025*z;
   float ad=abs(d);
   float line=1.-smoothstep(px,px*2.5,ad);
   float glow=exp(-ad/(.008+size*.018));
   float fade=smoothstep(0.,.12,z)*(1.-smoothstep(.8,1.,z));
   vec3 color=palette(float(i)*(.6/28.)+sin(angle)*.08+t*.018+uHue);
   col+=color*(line*.7+glow*.28)*fade*energy;
  }
 }
 // A soft vanishing point keeps the tunnel deep rather than filling it white.
 col+=palette(t*.018+uHue+.3)*.018/(.08+length(p));
 col*=1.-smoothstep(.45,1.5,length(p))*.75;
 gl_FragColor=vec4(col,1.);
}`;

const blades =
  common +
  `
uniform float uIntensity,uSpread,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 p=rot(.08*sin(t*.15))*p;
 vec3 col=vec3(.003,.007,.014);
 float px=1.3/uResolution.y;
 float energy=(.48+uRms*.85+uBeat*.25)*uIntensity;
 // Sweeping concave Xenon blades arranged in mirrored depth pairs.
 for(int i=0;i<8;i++){
  float k=float(i), side=mod(k,2.)*2.-1., tier=floor(k*.5)*.333;
  float span=.14+tier*(.22+uSpread*.12)+uBass*.04;
  float bend=.55+tier*.45+.15*sin(t*.3+k);
  float waveMod=wave(clamp(p.y*.65+.5,0.,1.))*(.02+uMid*.04);
  float curve=side*(span+bend*p.y*p.y)+sin(p.y*3.6-t*.45+k*.9)*.035+waveMod;
  float d=(p.x-curve)*side;
  float spec=fft(.12+tier*.7);
  float width=.024+tier*.02+spec*.025;
  float rim=1.-smoothstep(px,px*2.4,abs(d));
  float sheen=exp(-max(0.,d)/width)*smoothstep(-.012,px,d);
  float glow=exp(-abs(d)/(.01+width*.45));
  float ribs=.65+.35*sin(p.y*28.-t*1.4+k*1.7);
  vec3 color=palette(tier*.22+uHue+p.y*.08+t*.01);
  col+=color*(rim*.85+sheen*(.32+ribs*.45)+glow*.18)*(energy+spec*.45*uIntensity);
 }
 // Segmented four-quadrant Ring of Light core pulsing with the beat.
 float r=length(p), a=atan(p.y,p.x);
 float gap=smoothstep(.09,.18,abs(sin(a*2.+t*.25)));
 float ringR=.16+uBass*.035+fft(abs(a)*(1./PI))*.025;
 float ringD=abs(r-ringR);
 float ring=(1.-smoothstep(px,px*2.8,ringD)+exp(-ringD*55.)*.35)*gap;
 col+=palette(uHue+.12+r*.4)*ring*energy*1.15;
 col+=palette(uHue)*.022/(.09+r);
 col*=1.-smoothstep(.42,1.45,r)*.78;
 gl_FragColor=vec4(col,1.);
}`;

const lattice =
  common +
  `
uniform float uIntensity,uWarp,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 p=rot(.1*sin(t*.18)+wave(.5)*.04)*p;
 vec3 col=vec3(.003,.005,.016);
 float px=1.3/uResolution.y;
 float energy=(.5+uRms*.85+uBeat*.3)*uIntensity;
 // Gravity-well ripple warps space from the center on bass hits.
 float r=length(p);
 float ripple=sin(r*14.-t*2.6)*exp(-r*2.4)*(.03+uBass*.08)*uWarp;
 vec2 wp=p+normalize(p+1e-4)*ripple;
 float ay=abs(wp.y)+.035;
 float z=clamp(.28/ay,0.,18.);
 float fade=smoothstep(.035,.22,ay)*exp(-z*.14);
 // Dual perspective vector planes with audio-reactive longitudinal waves.
 vec2 g=vec2(wp.x*z*1.35,z-t*2.4);
 g.x+=sin(g.y*.45+t*.6)*(.18+uMid*.25)*uWarp;
 g.y+=wave(clamp(wp.x*.4+.5,0.,1.))*uWarp*.35;
 vec2 cell=abs(fract(g)-.5);
 vec2 gw=clamp(fwidth(g),vec2(.02),vec2(.35));
 vec2 lines=1.-smoothstep(gw*.55,gw*1.85,cell);
 float grid=max(lines.x,lines.y);
 float crossGlow=exp(-(cell.x+cell.y)*9.)*1.4;
 float spec=fft(clamp(abs(wp.x)*.75,0.,1.));
 vec3 gridCol=palette(z*.045+abs(wp.x)*.25+t*.02+uHue);
 col+=gridCol*(grid*.75+crossGlow*.35)*fade*(energy+spec*.5*uIntensity);
 // Horizon laser beacons and diamond nodes pulsing to frequency bands.
 for(int i=0;i<7;i++){
  float k=float(i)-3.;
  float bx=k*.24+sin(t*.35+k*1.3)*.035;
  float band=fft(.08+abs(k)*.26);
  float h=.05+band*.22+uBass*.05;
  float dx=abs(wp.x-bx), dy=abs(wp.y);
  float diamond=dx*1.4+dy-h*.45;
  float node=1.-smoothstep(px,px*2.5,abs(diamond));
  float pillar=exp(-dx*75.)*smoothstep(h*1.6,0.,dy)*(.25+band*.85);
  float halo=exp(-length(vec2(dx,max(0.,dy-h*.3)))*26.)*.22;
  vec3 bCol=palette(k*.09+uHue+.22+t*.015);
  col+=bCol*(node*.8+pillar+halo)*energy;
 }
 // Glowing horizon seam and soft vignette.
 col+=palette(uHue+.45+wp.x*.2)*exp(-abs(wp.y)*42.)*(.18+uBass*.22)*energy;
 col*=1.-smoothstep(.45,1.45,r)*.75;
 gl_FragColor=vec4(col,1.);
}`;

const mandala =
  common +
  `
uniform float uIntensity,uSymmetry,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 float r=length(p);
 float a=atan(p.y,p.x)+t*.11*sin(t*.09);
 float sector=PI/uSymmetry;
 float fa=abs(mod(a+sector,2.*sector)-sector);
 vec2 q=vec2(cos(fa),sin(fa))*r;
 vec3 col=vec3(.004,.005,.016);
 float px=1.3/uResolution.y;
 float energy=(.48+uRms*.9+uBeat*.3)*uIntensity;
 // Kaleidoscopic Lissajous petals and orbiting plasma nodes in folded polar space.
 for(int i=0;i<6;i++){
  float k=float(i), phase=k*.52+t*(.28+k*.04);
  float spec=fft(k*.16+.05);
  float rad=.11+k*.065+spec*.055+uBass*.04;
  float petal=rad*(.78+.28*cos(fa*uSymmetry*(1.+mod(k,2.))+phase))
    +wave(clamp(fa/sector,0.,1.))*(.018+uMid*.035);
  float d=abs(r-petal);
  float filament=1.-smoothstep(px,px*2.4,d);
  float halo=exp(-d/(.006+k*.003));
  vec2 orbPos=vec2(rad*cos(fa*.6+.18*sin(phase)),rad*sin(phase)*.42);
  float orbD=length(q-orbPos);
  float orb=(.0018+spec*.0025)/(.0012+orbD*orbD*18.);
  vec3 color=palette(k*.14+fa*.25+r*.35-t*.02+uHue);
  col+=color*(filament*.75+halo*.24+orb*.55)*(energy+spec*.4*uIntensity);
 }
 // Spectral history interference waves radiating from the core.
 float hist=texture2D(uAudioHistoryTexture,vec2(clamp(fa/sector,0.,1.),clamp(r*1.2,0.,1.))).r;
 float corona=pow(max(0.,cos(r*38.-t*1.6+hist*4.)),12.)*(.04+hist*.18)*exp(-r*1.8);
 col+=palette(uHue+.32+r*.5)*corona*energy;
 col+=palette(uHue+.15)*.024/(.07+r);
 col*=1.-smoothstep(.45,1.45,r)*.78;
 gl_FragColor=vec4(col,1.);
}`;

abstract class ConsoleLightModule extends ShaderModule {
  abstract params: {
    speed: number;
    intensity: number;
    hue: number;
    spread?: number;
    twist?: number;
    warp?: number;
    symmetry?: number;
  };
  protected abstract readonly fragment: string;
  private time = 0;
  private readonly hoops = Array.from({ length: 28 }, () => new T.Vector4());
  private readonly extra = {
    uIntensity: { value: 1 },
    uSpread: { value: 1 },
    uTwist: { value: 1 },
    uWarp: { value: 1 },
    uSymmetry: { value: 8 },
    uHue: { value: 0 },
    uHoops: { value: this.hoops },
  };
  init(_renderer: T.WebGLRenderer, w: number, h: number) {
    this.pass = new FullscreenPass(this.fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.resize(w, h);
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    this.time += dt * this.params.speed * (1 + audio.mid * 0.35);
    const t = this.time;
    const twist = this.params.twist ?? 1;
    this.uniforms.uTime.value = t;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uSpread.value = this.params.spread ?? 1;
    this.extra.uTwist.value = twist;
    this.extra.uWarp.value = this.params.warp ?? 1;
    this.extra.uSymmetry.value = this.params.symmetry ?? 8;
    this.extra.uHue.value = this.params.hue;
    if (this.id === "mandala") audio.uAudioHistoryTexture.needsUpdate = true;
    if (this.id === "prismatic") {
      for (let i = 0; i < 28; i++) {
        const z = (((i / 28 - t * 0.055) % 1) + 1) % 1;
        const iz = 1 - z;
        const cx = Math.sin(iz * 4 + t * 0.17) * 0.16 * z;
        const cy = Math.cos(iz * 3 + t * 0.13) * 0.16 * z;
        const rotAngle = t * 0.09 + iz * twist * 2;
        this.hoops[i].set(cx, cy, Math.cos(rotAngle), Math.sin(rotAngle));
      }
    }
  }
}

export class AuroraRibbonsModule extends ConsoleLightModule {
  readonly id = "aurora";
  readonly name = "Aurora ribbons";
  protected readonly fragment = ribbons;
  params = { speed: 0.8, intensity: 1.15, spread: 1, hue: 0.12 };
}

export class PrismaticDriftModule extends ConsoleLightModule {
  readonly id = "prismatic";
  readonly name = "Prismatic drift";
  protected readonly fragment = drift;
  params = { speed: 0.9, intensity: 1.2, twist: 1, hue: 0.55 };
}

export class XenonBladesModule extends ConsoleLightModule {
  readonly id = "blades";
  readonly name = "Xenon blades";
  protected readonly fragment = blades;
  params = { speed: 0.85, intensity: 1.2, spread: 1, hue: 0.28 };
}

export class VectorLatticeModule extends ConsoleLightModule {
  readonly id = "lattice";
  readonly name = "Vector lattice";
  protected readonly fragment = lattice;
  params = { speed: 0.95, intensity: 1.2, warp: 1, hue: 0.72 };
}

export class SolarMandalaModule extends ConsoleLightModule {
  readonly id = "mandala";
  readonly name = "Solar mandala";
  protected readonly fragment = mandala;
  params = { speed: 0.85, intensity: 1.2, symmetry: 8, hue: 0.88 };
}
