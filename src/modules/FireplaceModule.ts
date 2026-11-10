import type * as T from "three";
import type { AudioFrameData } from "../core/types";
import { common, FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";

// One fullscreen triangle, bounded loops, no textures or intermediate targets.
// Analytic motion also makes seeking and offline exports reproducible.
const fragment =
  common +
  `
uniform float uIntensity,uReactivity,uEmbers;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float turbulence(vec2 p){return noise(p)*.65+noise(p*2.03)*.25+noise(p*4.07)*.1;}
void main(){
 // Fit the hearth into either orientation without stretching the flames.
 vec2 p=(vUv-.5)*uResolution/min(uResolution.x,uResolution.y)*2.;
 float t=uTime,energy=clamp((uBass*.55+uRms*.3+uBeat*.15)*uReactivity,0.,1.5);
 float flicker=.92+.08*sin(t*7.1)+.04*sin(t*11.7);
 vec3 col=vec3(.008,.004,.003);
 // A dark masonry surround catches the warm light from the firebox.
 vec2 brick=vec2(p.x*5.+mod(floor(p.y*7.),2.)*.5,p.y*7.);
 vec2 edge=min(fract(brick),1.-fract(brick));
 float mortar=smoothstep(.015,.065,min(edge.x,edge.y));
 float light=exp(-dot(p-vec2(0.,-.3),p-vec2(0.,-.3))*1.7)*flicker;
 col+=vec3(.12,.045,.018)*light*(.35+.65*mortar);
 float box=1.-smoothstep(.015,.035,max(abs(p.x)-.82,abs(p.y+.03)-.82));
 col=mix(col,vec3(.004,.0015,.001)+vec3(.13,.025,.003)*light,box);
 float y=p.y+.63;
 if(box>0. && y>0.){
  float height=.95+energy*.32;
  vec2 q=vec2(p.x*3.8,y*3.2-t*1.65);
  float n=turbulence(q);
  float bend=sin(y*6.-t*2.)*.065*y+(.5-n)*.22*y;
  float width=max(.015,(1.-y/height)*.60);
  float shape=1.-abs(p.x+bend)/width;
  float heat=shape+n*.9-y/height*.75;
  float fade=(1.-smoothstep(height*.65,height*1.3,y))*smoothstep(0.,.055,y);
  float flame=smoothstep(.12,.46,heat)*fade;
  vec3 fire=mix(vec3(1.25,.065,.002),vec3(2.8,.65,.025),smoothstep(.25,.85,heat));
  fire=mix(fire,vec3(3.3,1.65,.32),smoothstep(.85,1.45,heat)*(1.-smoothstep(.1,.6,y)));
  col+=fire*flame*flicker;
  // Twelve seeded sparks, independent of framerate and without a particle pool.
  if(uEmbers>0.) for(int i=0;i<12;i++){
   float k=float(i),seed=hash(vec2(k,7.)),age=fract(t*(.13+seed*.12)+seed);
   vec2 pos=vec2((seed-.5)*1.05+sin(age*9.+k)*age*.13,-.55+age*1.45);
   vec2 d=(p-pos)/vec2(.007,.018);
   col+=vec3(1.8,.42,.025)*exp(-dot(d,d))*sin(age*PI)*(0.35+uTreble*uReactivity)*uEmbers;
  }
 }
 // Three charred logs with glowing fissures, in front of the flame roots.
 for(int i=0;i<3;i++){
  float k=float(i);
  vec2 q=rot((k-1.)*.23)*(p-vec2((k-1.)*.19,-.66+mod(k,2.)*.07));
  float d=length(vec2(max(abs(q.x)-.36,0.),q.y))-.075;
  float mask=1.-smoothstep(-.008,.008,d);
  float grain=noise(vec2(q.x*27.+k*13.,q.y*85.));
  float cracks=pow(max(0.,1.-abs(grain-.48)*9.),3.);
  vec3 wood=vec3(.025,.008,.003)+vec3(.9,.095,.004)*cracks*(.4+energy)*flicker;
  wood+=vec3(.22,.035,.002)*smoothstep(-.025,.075,q.y);
  col=mix(col,wood,mask);
 }
 col+=vec3(.24,.035,.002)*exp(-pow((p.y+.8)*20.,2.)-p.x*p.x*3.)*flicker;
 col*=uIntensity*(1.-smoothstep(.8,2.1,length(p))*.75);
 gl_FragColor=vec4(col,1.);
}`;

export class FireplaceModule extends ShaderModule {
  readonly id = "fireplace";
  readonly name = "Fireplace";
  params = { speed: 1, intensity: 1.2, reactivity: 1, embers: 1 };
  private readonly extra = {
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
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    this.uniforms.uTime.value = time * this.params.speed;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uReactivity.value = this.params.reactivity;
    this.extra.uEmbers.value = this.params.embers;
  }
}
