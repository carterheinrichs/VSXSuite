import type * as T from "three";
import type { AudioFrameData } from "../core/types";
import { common, FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";

// Procedural interpretation of https://esahubble.org/images/heic1310a/ (M57).
const fragment =
  common +
  `
uniform float uIntensity,uHue,uWarp,uStars,uReactivity;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){
 float n=0.,a=.5;
 for(int i=0;i<5;i++){n+=a*noise(p);p=rot(.53)*p*2.07+7.3;a*=.5;}
 return n;
}
void main(){
 float bass=uBass*uReactivity,beat=uBeat*uReactivity;
 // Bounded phase surges follow the beat envelope without multiplying the
 // absolute clock (which would jump more violently later in a song).
 float surge=beat*.65+bass*.18;
 float t=uTime*.12+surge;
 float warp=uWarp+beat*1.1+bass*.35;
 vec2 sky=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.)*2.6;
 vec2 p=rot(.28+.06*sin(t*.4)+beat*.075)*sky/(1.+bass*.18+beat*.065)*vec2(.87,1.12);
 vec2 drift=vec2(t*.16,-t*.11);
 vec2 flow=vec2(fbm(p*2.+drift),fbm(p*2.-drift+17.))-.5;
 vec2 q=p+flow*warp*(.19+bass*.13);
 float r=length(q),a=atan(q.y,q.x);
 float grain=fbm(q*8.+flow*3.+drift);
 float tendrils=fbm(vec2(cos(a),sin(a))*9.+vec2(r*17.-t,t*.2));
 float edge=.77+(.045+beat*.035)*sin(a*7.+t)+.025*sin(a*13.-t*.7);
 float shell=exp(-pow((r-edge+(.5-grain)*.12)/.19,2.));
 float filaments=pow(.5+.5*sin(r*95.+tendrils*18.-t*2.+warp*sin(a*9.+t)*2.),6.);
 // atan wraps from +PI to -PI. All angular colour and spectrum inputs
 // must close around the circle so the wrap cannot cut a visible wedge.
 float band=fft(.5+.5*sin(a))*uReactivity;
 vec3 gas=mix(vec3(.025,.55,1.),vec3(1.,.16,.035),smoothstep(.59,.95,r));
 gas=mix(gas,palette(r*1.8+grain*.5+.22*sin(a)+.13*cos(a)-t*.18+uHue),.7);
 vec3 col=vec3(.002,.003,.013);
 col+=gas*shell*(.55+grain*.65+filaments*(.7+band*1.5))*(1.+bass*.6+beat*.45);
 float inner=exp(-r*r*3.)*(1.-smoothstep(.45,.75,r));
 col+=vec3(.025,.13,.25)*inner*(.7+grain)*(1.+uMid*uReactivity);
 float outer=exp(-pow((r-1.06)/.34,2.));
 float echoes=pow(.5+.5*sin(r*49.-grain*9.-t*2.),8.);
 col+=palette(r+.28*sin(a)-t*.1+uHue)*outer*echoes*.2*warp;
 float front=exp(-pow((length(p)-(1.-clamp(uBeat,0.,1.))*1.8)/.055,2.))*beat;
 col+=palette(a/PI+uHue)*front*.22;
 vec2 grid=sky*23.,cell=floor(grid);
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
  vec2 id=cell+vec2(float(x),float(y));
  vec2 d=grid-id-vec2(hash(id),hash(id+31.));
  float seed=hash(id+73.),dist=length(d),bright=pow(seed,16.);
  float star=exp(-dist*dist/.0012)*(.2+bright*3.);
  star+=bright*exp(-min(abs(d.x),abs(d.y))*110.)*exp(-dist*7.)*(.25+uTreble*uReactivity);
  col+=mix(vec3(.5,.7,1.),vec3(1.,.7,.4),seed)*star*uStars;
 }
 col+=vec3(.65,.85,1.)*exp(-dot(p,p)*14000.)*3.;
 col*=uIntensity*(1.-.25*smoothstep(.8,2.4,length(sky)));
 gl_FragColor=vec4(max(col,vec3(0.)),1.);
}`;

export class HubbleAcidModule extends ShaderModule {
  readonly id = "hubble-acid";
  readonly name = "Hubble Ring ON ACID";
  params = {
    speed: 1,
    intensity: 1.7,
    hue: 0,
    warp: 1,
    stars: 1,
    reactivity: 1,
  };
  private readonly extra = {
    uIntensity: { value: 1.7 },
    uHue: { value: 0 },
    uWarp: { value: 1 },
    uStars: { value: 1 },
    uReactivity: { value: 1 },
  };
  init(_renderer: T.WebGLRenderer, width: number, height: number) {
    this.pass = new FullscreenPass(fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.resize(width, height);
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    this.uniforms.uTime.value = time * this.params.speed;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uHue.value = this.params.hue;
    this.extra.uWarp.value = this.params.warp;
    this.extra.uStars.value = this.params.stars;
    this.extra.uReactivity.value = this.params.reactivity;
  }
}
