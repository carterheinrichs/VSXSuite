// Compact 3D simplex noise & analytic gradient (Ashima Arts / Stefan Gustavson, MIT).
export const simplex = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 invSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
vec4 snoiseGrad(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy),i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx,x2=x0-i2+C.yyy,x3=x0-D.yyy;i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));float n_=1./7.;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z),y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy,y=y_*ns.x+ns.yyyy,h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy),b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.+1.,s1=floor(b1)*2.+1.,sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy,a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x),p1=vec3(a0.zw,h.y),p2=vec3(a1.xy,h.z),p3=vec3(a1.zw,h.w);vec4 norm=invSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);vec4 m2=m*m,m3=m2*m,m4=m2*m2;vec4 pdotx=vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3));vec4 temp=-8.*m3*pdotx;vec3 grad=42.*(m4.x*p0+m4.y*p1+m4.z*p2+m4.w*p3+temp.x*x0+temp.y*x1+temp.z*x2+temp.w*x3);return vec4(grad,42.*dot(m4,pdotx));}
float snoise(vec3 v){return snoiseGrad(v).w;}
`;
