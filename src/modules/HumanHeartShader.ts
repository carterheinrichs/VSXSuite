import { common } from "../shaders/shared";

// Two SVG samples and simple 2D valve masks; the silhouette never deforms.
export const fragment =
  common +
  `
uniform sampler2D uHeart,uCutawayHeart;
uniform float uIntensity,uHue,uCutaway;
uniform vec2 uValveOpen,uChambers;
vec3 valve(vec3 color,vec2 uv,vec2 center,float opening,float cusps){
 vec2 q=(uv-center)/vec2(39./600.,19./760.);
 float radius=length(q),angle=atan(q.y,q.x);
 float disk=1.-smoothstep(.88,1.,radius);
 float aperture=.10+opening*.62+.055*cos(angle*cusps);
 float leaf=smoothstep(aperture-.05,aperture+.05,radius);
 vec3 tissue=mix(vec3(.38,.20,.15),vec3(.83,.65,.43),clamp(q.y*.4+.6,0.,1.));
 tissue*=.9+.1*cos(angle*cusps);
 return mix(color,mix(vec3(.035,.012,.025),tissue,leaf),disk);
}
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 p*=max(1.,uResolution.y/uResolution.x);
 vec2 uv=p/vec2(.76,.963)+.5;
 vec4 exterior=texture2D(uHeart,clamp(uv,0.,1.));
 vec4 cutaway=texture2D(uCutawayHeart,clamp(uv,0.,1.));
 vec4 heart=mix(exterior,cutaway,uCutaway);
 float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
 vec3 color=heart.rgb;
 // Local chamber illumination follows separate audio bands and valve phases.
 float right=(1.-smoothstep(.25,1.,length((uv-vec2(.35,.36))/vec2(.10,.15))));
 float left=(1.-smoothstep(.25,1.,length((uv-vec2(.62,.34))/vec2(.10,.17))));
 color+=vec3(.19,.055,.025)*(right*uChambers.x+left*uChambers.y)*uCutaway;
 if(uCutaway>.5){
  color=valve(color,uv,vec2(220./600.,1.-382./760.),uValveOpen.x,3.);
  color=valve(color,uv,vec2(353./600.,1.-382./760.),uValveOpen.y,2.);
 }
 color=mix(color,color.gbr,uHue);
 vec3 background=vec3(.006,.002,.008)+vec3(.034,.004,.009)*exp(-dot(p,p)*4.);
 gl_FragColor=vec4(mix(background,color,heart.a*inside)*uIntensity,1.);
}`;
