import type * as T from "three";
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
 // Back-to-front translucent curtains with independently moving folds.
 for(int i=0;i<9;i++){
  float k=float(i), depth=k/8.;
  float x=p.x*(1.+depth*.35);
  float center=sin(x*2.1+t*.24+k*.54)*(.18+uSpread*.12)
    +sin(x*4.3-t*.18+k*.7)*.055+(depth-.5)*.32;
  center+=wave(clamp(x*.24+.5,0.,1.))*(.025+uBass*.055);
  float d=p.y-center;
  float width=.018+depth*.018+uMid*.012;
  float body=exp(-d*d/(width*width));
  float edge=exp(-abs(d-width*.6)*180.);
  float halo=exp(-abs(d)*12.);
  float pleats=.6+.4*sin(x*19.+k*2.+t*.35+sin(x*5.+t*.2)*2.);
  vec3 color=palette(depth*.28+x*.12+t*.012+uHue);
  col+=color*(body*(.25+pleats*.6)+edge*.5+halo*.045)
    *( .45+uRms*.85+fft(depth*.6)*.4)*uIntensity;
 }
 col+=palette(uHue+.18)*.025/(.12+length(p-vec2(.45*sin(t*.1),0.)));
 col*=1.-smoothstep(.35,1.4,length(p))*.8;
 gl_FragColor=vec4(col,1.);
}`;

const drift =
  common +
  `
uniform float uIntensity,uTwist,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 vec3 col=vec3(.003,.005,.015);
 float t=uTime;
 // Nested perspective hoops travel toward the camera; no raymarching required.
 for(int i=0;i<28;i++){
  float z=fract(float(i)/28.-t*.055);
  float size=.035+z*z*1.65;
  vec2 center=vec2(sin((1.-z)*4.+t*.17),cos((1.-z)*3.+t*.13))*.16*z;
  vec2 q=rot(t*.09+(1.-z)*uTwist*2.)*(p-center);
  float angle=atan(q.y,q.x);
  float shape=1.+.13*cos(angle*5.+(1.-z)*5.+t*.2);
  float spectrum=fft(fract(angle/(2.*PI)+.5));
  float d=length(q)-size*shape*(1.+uBass*.08)-spectrum*.025*z;
  float width=max(1.3/uResolution.y,fwidth(d));
  float line=1.-smoothstep(width,width*2.5,abs(d));
  float glow=exp(-abs(d)/(.008+size*.018));
  float fade=smoothstep(0.,.12,z)*(1.-smoothstep(.8,1.,z));
  vec3 color=palette(float(i)/28.*.6+angle*.08+t*.018+uHue);
  col+=color*(line*.7+glow*.28)*fade*uIntensity*(.5+uRms+uBeat*.3);
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
  private readonly extra = {
    uIntensity: { value: 1 },
    uSpread: { value: 1 },
    uTwist: { value: 1 },
    uHue: { value: 0 },
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
    this.uniforms.uTime.value = this.time;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uSpread.value = this.params.spread ?? 1;
    this.extra.uTwist.value = this.params.twist ?? 1;
    this.extra.uHue.value = this.params.hue;
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
