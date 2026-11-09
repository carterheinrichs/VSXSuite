import type * as T from "three";
import type { AudioFrameData } from "../core/types";
import { common, FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";

// Procedural emission and extinction, inspired by telescope imagery rather
// than a photograph or a physical simulation. Fixed seeds also work offline.
const fragment =
  common +
  `
uniform float uIntensity,uHue,uDust,uStars,uDrift,uReactivity;
vec3 hash3(vec3 p){return fract(sin(vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))))*43758.5453);}
float noise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash3(i).x,hash3(i+vec3(1,0,0)).x,f.x),mix(hash3(i+vec3(0,1,0)).x,hash3(i+vec3(1,1,0)).x,f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)).x,hash3(i+vec3(1,0,1)).x,f.x),mix(hash3(i+vec3(0,1,1)).x,hash3(i+vec3(1,1,1)).x,f.x),f.y),f.z);
}
float fbm(vec3 p){
 float n=0.,a=.52;
 for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.03+vec3(5.2,1.3,7.1);a*=.48;}
 return n;
}
vec3 stars(vec2 p,float layer){
 vec2 grid=p*(45.+layer*32.);vec2 cell=floor(grid);vec3 col=vec3(0.);
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
  vec2 id=cell+vec2(float(x),float(y));vec3 h=hash3(vec3(id,layer+13.));
  vec2 d=grid-id-.15-h.xy*.7;float r=length(d);
  float sparkle=fft(h.y)*uReactivity;
  float bright=pow(h.z,12.);float size=(.018+bright*.022)*(1.+sparkle*.65);
  float core=exp(-r*r/(size*size));
  float halo=.035*exp(-r*13.);
  float spikes=exp(-min(abs(d.x),abs(d.y))*150.)*exp(-r*7.)*bright*(.45+uTreble*uReactivity*1.8);
  vec3 color=mix(vec3(.58,.76,1.),vec3(1.,.78,.51),h.x);
  col+=color*(core+halo+spikes)*(.25+bright*4.)*(.9+.1*sin(uTime*.6+h.y*30.))*(1.+sparkle*2.+uTreble*uReactivity*.6);
 }
 return col*uStars;
}
void main(){
 float t=uTime*.025*uDrift;
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.)*2.;
 float bass=uBass*uReactivity,beat=uBeat*uReactivity;
 p=rot(.16)*p/(1.+bass*.14+beat*.035);
 // Expanding illumination fronts follow the decaying beat envelope.
 float radius=length(p-vec2(.35,.22));
 float front=exp(-pow((radius-(1.-clamp(uBeat,0.,1.))*1.9)/.16,2.))*beat;
 vec3 q=vec3(p*1.65+vec2(t*.12,-t*.08),t*.09);
 vec2 warp=vec2(fbm(q+3.7),fbm(q+19.1))-.5;
 q.xy+=warp*bass*.38+vec2(-warp.y,warp.x)*uMid*uReactivity*.22;
 float cloud=fbm(q+vec3(warp*2.4,0.));
 float fine=fbm(q*3.4+vec3(warp*3.,2.));
 float bank=smoothstep(.28,.75,cloud);
 float ridge=pow(max(0.,1.-abs(fine-.51)*5.),3.);
 float cavity=exp(-dot((p-vec2(.35,.22))*vec2(.9,1.25),(p-vec2(.35,.22))*vec2(.9,1.25))*2.);
 vec3 oxygen=vec3(.045,.48,.72),hydrogen=vec3(.85,.12,.18),sulfur=vec3(1.,.55,.13);
 vec3 gas=mix(hydrogen,sulfur,smoothstep(.37,.67,fine));
 gas=mix(gas,oxygen,clamp(cavity*.9+uMid*uReactivity*.18,0.,1.));
 // Hue shifts preserve the default gold/cyan narrowband-inspired palette.
 gas=mix(gas,gas.gbr,clamp(uHue,0.,1.));
 float spectrum=fft(clamp(radius*.45,0.,1.))*uReactivity;
 vec3 col=vec3(.001,.003,.009)+gas*bank*(.24+ridge*(.65+spectrum*.8))*(1.+uReactivity*(uRms*.9+uMid*.5)+front*1.6);
 float pillars=fbm(vec3(p.x*3.+warp.x*1.6,p.y*.85+warp.y*.8+1.4,t*.035+7.));
 float dust=smoothstep(.48,.7,pillars)*(1.-smoothstep(-.8,.65,p.y))*uDust;
 float transmission=exp(-dust*4.5);
 col*=transmission;
 col+=gas*pow(max(0.,1.-abs(pillars-.5)*22.),3.)*(.13+bass*.25+front*.4)*min(uDust,1.5)*bank;
 col+=stars(p+vec2(t*.035,0.),0.)*mix(.35,1.,transmission);
 col+=stars(p*.83-vec2(t*.018,0.),1.)*.45;
 col*=uIntensity*(1.+beat*.22);
 col*=1.-.3*smoothstep(.4,2.2,length(p));
 gl_FragColor=vec4(max(col,vec3(0.)),1.);
}`;

export class HubbleNebulaModule extends ShaderModule {
  readonly id = "hubble-nebula";
  readonly name = "Hubble Nebula";
  params = {
    speed: 1,
    intensity: 1.6,
    hue: 0,
    dust: 1,
    stars: 1,
    drift: 1,
    reactivity: 1,
  };
  private readonly extra = {
    uIntensity: { value: 1.6 },
    uHue: { value: 0 },
    uDust: { value: 1 },
    uStars: { value: 1 },
    uDrift: { value: 1 },
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
    this.extra.uDust.value = this.params.dust;
    this.extra.uStars.value = this.params.stars;
    this.extra.uDrift.value = this.params.drift;
    this.extra.uReactivity.value = this.params.reactivity;
  }
}
