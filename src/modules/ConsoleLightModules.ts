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

abstract class ConsoleLightModule extends ShaderModule {
  abstract params: {
    speed: number;
    intensity: number;
    hue: number;
    spread?: number;
    twist?: number;
  };
  protected abstract readonly fragment: string;
  private time = 0;
  private readonly hoops = Array.from({ length: 28 }, () => new T.Vector4());
  private readonly extra = {
    uIntensity: { value: 1 },
    uSpread: { value: 1 },
    uTwist: { value: 1 },
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
    this.extra.uHue.value = this.params.hue;
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
