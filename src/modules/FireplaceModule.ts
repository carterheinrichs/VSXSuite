import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { common, FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";
import hearthUrl from "../assets/fireplace-hearth.webp?url";

// One fullscreen triangle, one bundled texture, no intermediate targets.
// Analytic motion also makes seeking and offline exports reproducible.
const fragment =
  common +
  `
uniform float uIntensity,uReactivity,uEmbers;
uniform sampler2D uHearth;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float turbulence(vec2 p){return noise(p)*.65+noise(p*2.03)*.25+noise(p*4.07)*.1;}
void main(){
 // Fit the hearth into either orientation without stretching the flames.
 vec2 p=(vUv-.5)*uResolution/min(uResolution.x,uResolution.y)*2.;
 float t=uTime;
 float energy=clamp((uBass*.85+uSub*.25+uRms*.35)*uReactivity,0.,1.5);
 float attack=clamp(uBeat*uReactivity,0.,1.5);
 float flicker=.92+.08*sin(t*7.1)+.04*sin(t*11.7);
 vec2 uv=clamp(p*.5+.5,0.,1.);
 vec3 hearth=texture2D(uHearth,uv).rgb;
 float border=1.-smoothstep(.94,1.02,max(abs(p.x),abs(p.y)));
 vec3 col=hearth*(.78+flicker*.28+energy*.22+attack*.08)*border;
 float y=p.y+.70;
 // Match the upper silhouettes of the side logs and lower front log.
 // Flame roots sit behind this contour, so wood occludes the fire naturally.
 float logTop=-.56+.19*smoothstep(.12,.45,abs(p.x))+.018*sin(p.x*39.);
 float exposed=smoothstep(logTop-.012,logTop+.025,p.y);
 // Shared rising turbulence distorts five independently moving flame tongues.
 if(abs(p.x)<.83 && y>0. && y<1.8){
  float n=turbulence(vec2(p.x*6.,y*4.-t*1.8));
  float detail=noise(vec2(p.x*21.,y*12.-t*3.5));
  float heat=0.;
  for(int i=0;i<5;i++){
   float k=float(i),seed=hash(vec2(k,3.));
   float h=(.65+seed*.40+energy*.38+attack*.30)*(.86+.14*sin(t*(1.8+seed)+k*2.));
   float localY=max(0.,y-.045*mod(k,2.));
   float rise=localY/h;
   float center=(k-2.)*.22+sin(y*7.-t*(1.6+seed)+k)*y*.12+(n-.5)*y*.38;
   float width=(.13+seed*.05+energy*.018+attack*.025)*max(.01,1.-rise);
   float body=1.-abs(p.x-center)/width+(n-.5)*1.8;
   float tongue=smoothstep(-.3,.65,body)*(1.-smoothstep(.55,1.05,rise));
   heat+=tongue*(.55+.45*detail);
  }
  float root=smoothstep(0.,.07,y)*exposed;
  float wisps=smoothstep(.05,.45,heat);
  vec3 fire=mix(vec3(.85,.035,.001),vec3(2.2,.48,.012),clamp(heat,0.,1.));
  fire=mix(fire,vec3(2.7,1.25,.19),smoothstep(.9,1.9,heat));
  col+=fire*wisps*root*flicker*(1.+energy*.12+attack*.22);
  // Twelve seeded sparks, independent of framerate and without a particle pool.
  if(uEmbers>0.) for(int i=0;i<12;i++){
   float k=float(i),seed=hash(vec2(k,7.)),age=fract(t*(.13+seed*.12)+seed);
   vec2 pos=vec2((seed-.5)*1.05+sin(age*9.+k)*age*.13,-.65+age*1.65);
   vec2 d=(p-pos)/vec2(.007,.018);
   col+=vec3(1.8,.42,.025)*exp(-dot(d,d))*sin(age*PI)*(0.35+uTreble*uReactivity+attack*.8)*uEmbers*exposed;
  }
 }
 // Texture supplies real bark and ash detail; warm pixels receive ember pulses.
 float coals=(1.-smoothstep(-.55,-.42,p.y))*smoothstep(.03,.25,hearth.r-hearth.g);
 col+=hearth*vec3(.7,.25,.06)*coals*(.65+energy+attack*.7)*flicker*border;
 col*=uIntensity*(1.-smoothstep(.8,2.1,length(p))*.75);
 gl_FragColor=vec4(col,1.);
}`;

export class FireplaceModule extends ShaderModule {
  readonly id = "fireplace";
  readonly name = "Fireplace";
  params = { speed: 1, intensity: 1.2, reactivity: 1, embers: 1 };
  private texture?: T.Texture;
  private loading?: Promise<void>;
  private disposed = false;
  private readonly extra = {
    uHearth: { value: null as T.Texture | null },
    uIntensity: { value: 1.2 },
    uReactivity: { value: 1 },
    uEmbers: { value: 1 },
  };
  init(_renderer: T.WebGLRenderer, width: number, height: number) {
    this.pass = new FullscreenPass(fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.resize(width, height);
  }
  override prepare(renderer: T.WebGLRenderer) {
    return (this.loading ??= new T.TextureLoader()
      .loadAsync(hearthUrl)
      .then(async (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = T.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = texture.magFilter = T.LinearFilter;
        this.texture = texture;
        this.extra.uHearth.value = texture;
        await super.prepare(renderer);
      })
      .catch((error) => {
        this.loading = undefined;
        throw error;
      }));
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    this.uniforms.uTime.value = time * this.params.speed;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uReactivity.value = this.params.reactivity;
    this.extra.uEmbers.value = this.params.embers;
  }
  override dispose() {
    this.disposed = true;
    this.texture?.dispose();
    super.dispose();
  }
}
