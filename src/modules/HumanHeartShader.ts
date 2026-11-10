import { common } from "../shaders/shared";

// One SVG texture sample; no ray marching, anatomy loops or GPU readback.
export const fragment =
  common +
  `
uniform sampler2D uHeart;
uniform float uIntensity,uHue,uContraction,uTurn;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 p*=max(1.,uResolution.y/uResolution.x);
 p=rot(sin(uTime*.65)*.025*uTurn)*p;
 // Ventricles contract more than the great vessels; the apex lifts slightly.
 float ventricle=1.-smoothstep(-.1,.32,p.y);
 p.x/=1.-uContraction*.065*ventricle;
 p.y=(p.y-uContraction*.012*ventricle)/(1.-uContraction*.045*ventricle);
 vec2 uv=p/vec2(.76,.963)+.5;
 vec4 heart=texture2D(uHeart,clamp(uv,0.,1.));
 float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
 float vignette=exp(-dot(p,p)*4.);
 vec3 background=vec3(.006,.002,.008)+vec3(.034,.004,.009)*vignette;
 vec3 color=mix(heart.rgb,heart.gbr,uHue);
 gl_FragColor=vec4(mix(background,color,heart.a*inside)*uIntensity,1.);
}`;
