import type * as T from "three";
import type { AudioFrameData } from "../core/types";
import { common, FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";

// A sculpted anatomical impression: asymmetric ventricles, atria and great
// vessels. Everything is procedural and timestamp driven for offline export.
const fragment =
  common +
  `
uniform float uIntensity,uHue,uReactivity,uVessels,uTurn,uCutaway;
float contraction,valveOpen;
float tissue(vec3 p){return sin(p.x*37.+sin(p.y*29.))*sin(p.z*41.+p.y*17.)*.5+sin(p.x*83.+p.z*31.)*sin(p.y*71.)*.25;}
float ellipsoid(vec3 p,vec3 r){return (length(p/r)-1.)*min(r.x,min(r.y,r.z));}
float blend(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float tube(vec3 p,vec3 a,vec3 b,float r){vec3 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.))-r;}
vec3 local(vec3 p){p.xz=rot(.24+sin(uTime*.17)*.16*uTurn)*p.xz;p.xy=rot(-.16)*p.xy;p/=1.-contraction*.09;return p;}
float organ(vec3 p){
 vec3 q=p-vec3(.16,-.18,0.);q.xy=rot(-.30)*q.xy;
 float d=ellipsoid(q,vec3(.43,.72,.38));
 q=p-vec3(-.23,.02,.03);q.xy=rot(.27)*q.xy;
 d=blend(d,ellipsoid(q,vec3(.39,.51,.34)),.19);
 d=blend(d,ellipsoid(p-vec3(-.34,.39,-.03),vec3(.27,.27,.29)),.12);
 d=blend(d,ellipsoid(p-vec3(.31,.42,-.08),vec3(.24,.25,.26)),.12);
 // Aortic arch, ascending trunk and three branches.
 d=blend(d,tube(p,vec3(.05,.36,-.02),vec3(.04,.79,-.04),.135),.10);
 d=blend(d,tube(p,vec3(.04,.79,-.04),vec3(.23,.95,-.06),.13),.10);
 d=blend(d,tube(p,vec3(.23,.95,-.06),vec3(.43,.80,-.12),.12),.10);
 d=min(d,tube(p,vec3(.43,.80,-.12),vec3(.44,.52,-.18),.115));
 d=blend(d,tube(p,vec3(-.37,.35,-.07),vec3(-.43,.88,-.1),.105),.08);
 d=blend(d,tube(p,vec3(-.12,.41,.12),vec3(-.24,.68,.17),.12),.08);
 d=blend(d,tube(p,vec3(-.24,.68,.17),vec3(-.59,.69,.10),.09),.08);
 for(int i=0;i<3;i++){float x=float(i);d=blend(d,tube(p,vec3(.12+x*.10,.87,-.06),vec3(.08+x*.16,1.16-x*.035,-.08),.045),.045);}
 return d;
}
float cavities(vec3 p){
 return min(ellipsoid(p-vec3(.22,-.15,.27),vec3(.235,.49,.40)),ellipsoid(p-vec3(-.25,-.03,.28),vec3(.205,.37,.38)));
}
// Thin scalloped leaflets fold back toward their annulus during filling.
// The two visible atrioventricular valves have two and three cusps.
float valve(vec3 p,vec3 center,float cusps){
 vec3 q=p-center;q.yz=rot(.38)*q.yz;
 float radius=length(q.xy),angle=atan(q.y,q.x);
 float aperture=.012+valveOpen*.105;
 float scallop=.012*cos(angle*cusps);
 float leaflet=max(radius-.153,aperture+scallop-radius);
 float depth=.025+valveOpen*.10*(1.-clamp(radius/.16,0.,1.));
 float membrane=max(leaflet,abs(q.z-depth)-.009);
 float ring=length(vec2(radius-.157,q.z-.025))-.014;
 return min(membrane,ring);
}
float valves(vec3 p){
 float d=min(valve(p,vec3(.22,.14,.16),2.),valve(p,vec3(-.25,.18,.17),3.));
 // Chordae anchor the leaflet edges to papillary muscles in each ventricle.
 for(int side=0;side<2;side++){
  float x=side==0 ? .22 : -.25;
  for(int i=0;i<3;i++){
   float a=float(i)*2.094;
   vec3 edge=vec3(x+cos(a)*(.055+valveOpen*.07),.15+sin(a)*.10,.19);
   vec3 anchor=vec3(x+cos(a)*.075,-.29,.02);
   d=min(d,tube(p,edge,anchor,.004));
  }
 }
 return d;
}
float muscle(vec3 p){
 float d=organ(p);
 if(uCutaway>.5)d=max(d,-cavities(p));
 return d;
}
float anatomy(vec3 p){float d=muscle(p);if(uCutaway>.5)d=min(d,valves(p));return d;}
float map(vec3 p){return anatomy(local(p));}
float vessels(vec3 p){
 float d=10.;
 // Descending coronary artery and alternating lateral branches on the front.
 for(int i=0;i<7;i++){
  float t=float(i)/7.,s=float(i+1)/7.;
  vec3 a=vec3(-.12+.38*t+.035*sin(t*9.),.49-1.20*t,.35);
  vec3 b=vec3(-.12+.38*s+.035*sin(s*9.),.49-1.20*s,.35);
  d=min(d,tube(p,a,b,.018-.009*t));
  float side=mod(float(i),2.)*2.-1.;
  vec3 c=a+vec3(side*(.25-.12*t),-.13,0.);
  d=min(d,tube(p,a,c,.011-.005*t));
  d=min(d,tube(p,c,c+vec3(side*.055,-.12,0.),.006));
 }
 return d;
}
void main(){
 float phase=fract(uTime*1.12);
 float rest=exp(-pow((phase-.12)/.065,2.))+.4*exp(-pow((phase-.29)/.09,2.));
 contraction=clamp(.55*rest+uReactivity*(.42*uBeat+.18*uBass),0.,1.);
 valveOpen=1.-smoothstep(.12,.65,contraction);
 vec2 uv=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 // Fit the whole sculpture in portrait as well as landscape.
 uv*=max(1.,uResolution.y/uResolution.x);
 vec3 ro=vec3(0.,.13,3.8),rd=normalize(vec3(uv*2.5,-3.8));
 // Soft, out-of-focus red tissue enclosing the scene, with deep edge shadows.
 float wall=sin(uv.x*8.+sin(uv.y*6.)*1.5)*sin(uv.y*9.-uv.x*3.);
 float vignette=exp(-dot(uv*vec2(.9,1.1),uv*vec2(.9,1.1))*2.5);
 vec3 col=vec3(.025,.0015,.003)+vec3(.105,.008,.013)*vignette*(.75+.25*wall);
 float travel=0.;vec3 p=ro;bool hit=false;
 for(int i=0;i<112;i++){p=ro+rd*travel;float d=map(p);if(d<.0012){hit=true;break;}travel+=max(d*.72,.001);if(travel>6.)break;}
 if(hit){
  vec2 e=vec2(.002,0.);vec3 n=normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));
  vec3 q=local(p);vec3 vesselPoint=q;vesselPoint.z=.35;float vein=vessels(vesselPoint);
  float lines=exp(-max(vein,0.)*160.)*uVessels;
  float grain=tissue(q);
  float interior=uCutaway>.5 ? 1.-smoothstep(.003,.025,abs(cavities(q))) : 0.;
  float isValve=uCutaway>.5 && valves(q)<.005 ? 1. : 0.;
  vec3 red=mix(vec3(.19,.013,.022),vec3(.38,.052,.059),.45+grain*.22);
  red=mix(red,vec3(.26,.027,.035)*(1.+grain*.18),interior);
  vec2 leaflet=q.xy-vec2(q.x>0. ? .22 : -.25,q.x>0. ? .14 : .18);
  float seam=pow(.5+.5*cos(atan(leaflet.y,leaflet.x)*(q.x>0. ? 2. : 3.)),20.);
  red=mix(red,vec3(.48,.30,.21)*(1.+grain*.12-seam*.24),isValve);
  red=mix(red,red.gbr,uHue);
  vec3 light=normalize(vec3(-.7,.9,1.5));
  float diffuse=max(dot(n,light),0.),rim=pow(1.-max(dot(n,-rd),0.),3.);
  float spec=pow(max(dot(n,normalize(light-rd)),0.),65.);
  float pulse=pow(.5+.5*cos(q.y*13.+uTime*7.),12.)*(.25+uMid*uReactivity*2.);
  float occlusion=clamp(map(p+n*.065)/.065,.25,1.);
  col=red*(.20+diffuse*1.45)*occlusion+vec3(.8,.56,.43)*spec*.27;
  col+=vec3(.23,.035,.027)*rim*.25+red*pow(max(dot(-n,light),0.),2.)*.28;
  // Coronary vessels remain dark blood red rather than emissive neon.
  col=mix(col,col*vec3(.48,.24,.28),clamp(lines,0.,1.)*(1.-interior)*(1.-isValve)*.7);
  col+=red*pulse*.045*uReactivity*(1.-isValve);
 }
 col*=uIntensity;
 gl_FragColor=vec4(max(col,vec3(0.)),1.);
}`;

export class HumanHeartModule extends ShaderModule {
  readonly id = "human-heart";
  readonly name = "Human Heart";
  params = {
    speed: 1,
    intensity: 1.1,
    hue: 0,
    reactivity: 1,
    vessels: 1,
    turn: 1,
    cutaway: true,
  };
  private readonly extra = {
    uIntensity: { value: 1.1 },
    uHue: { value: 0 },
    uReactivity: { value: 1 },
    uVessels: { value: 1 },
    uTurn: { value: 1 },
    uCutaway: { value: 1 },
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
    this.extra.uReactivity.value = this.params.reactivity;
    this.extra.uVessels.value = this.params.vessels;
    this.extra.uTurn.value = this.params.turn;
    this.extra.uCutaway.value = this.params.cutaway ? 1 : 0;
  }
}
