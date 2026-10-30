// The approved demo's shaders, verbatim: a sphere with domain-warped noise flowing over its surface, lit from the top
// left with shading that keeps the hue, a soft and a crisp highlight, a faint window reflection and a light rim.

export const VERTEX_SHADER = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

export const FRAGMENT_SHADER = `precision highp float;
uniform vec2 uRes;uniform float uTime;uniform float uRot;uniform float uEnergy;uniform float uSeed;
uniform float uSwirl;uniform float uSat;uniform float uLightA;
uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uC3;uniform vec3 uC4;
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;
vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float f=0.0;float a=0.55;for(int i=0;i<2;i++){f+=a*snoise(p);p=p*1.8+vec3(1.7,9.2,3.1);a*=0.45;}return f;}
vec2 rot2(vec2 v,float a){float c=cos(a),s=sin(a);return vec2(c*v.x-s*v.y,s*v.x+c*v.y);}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  float R=0.485;float d=length(uv);
  float alpha=smoothstep(R,R-2.4/uRes.y,d);
  if(alpha<=0.0){gl_FragColor=vec4(0.0);return;}
  vec2 xy=uv/R;float z=sqrt(max(0.0,1.0-dot(xy,xy)));vec3 n=normalize(vec3(xy,z));float edge=length(xy);
  float ca=cos(uRot),sa=sin(uRot);vec3 nr=vec3(ca*n.x+sa*n.z,n.y,-sa*n.x+ca*n.z);
  nr=vec3(nr.x,0.94*nr.y-0.34*nr.z,0.34*nr.y+0.94*nr.z);
  nr.xy=rot2(nr.xy,uSwirl*(1.25-edge)*2.6);
  vec3 sd=vec3(uSeed,uSeed*0.37,uSeed*0.71);
  vec3 p=nr*0.8+sd+vec3(0.0,0.0,uTime);
  float warp=0.7*(1.0+0.55*uEnergy);
  vec3 q=vec3(fbm(p),fbm(p+vec3(5.2,1.3,2.8)),fbm(p+vec3(1.7,9.2,4.4)));
  vec3 w=vec3(fbm(p+warp*q+vec3(1.7,9.2,0.3)),fbm(p+warp*q+vec3(8.3,2.8,5.1)),0.0);
  float f=0.5+0.5*fbm(p+warp*w);
  vec3 col=mix(uC1,uC2,smoothstep(0.08,0.58,f));
  col=mix(col,uC3,smoothstep(0.34,0.92,f+0.16*w.x));
  col=mix(col,uC4,smoothstep(0.58,1.10,f+0.24*q.y-0.08*uEnergy));
  vec2 l2=rot2(vec2(-0.5,0.62),uLightA);
  vec3 L=normalize(vec3(l2,0.6));vec3 V=vec3(0.0,0.0,1.0);vec3 H=normalize(L+V);
  float shade=0.5+0.5*dot(n,L);
  col=mix(mix(uC1,col,0.45),col,smoothstep(0.05,0.8,shade));
  col*=0.93+0.12*shade;
  col+=(0.06+0.14*uEnergy)*uC4*pow(z,2.0);
  float lum=dot(col,vec3(0.299,0.587,0.114));
  col=clamp(mix(vec3(lum),col,1.0+0.5*uSat),0.0,1.0);
  float fres=pow(1.0-z,3.0);
  col=mix(col,uC3,(0.14+0.16*uEnergy)*fres);
  float nh=clamp(dot(n,H),0.0,1.0);
  col+=vec3(1.0)*(0.20*pow(nh,18.0)+0.34*pow(nh,420.0));
  vec2 wc=rot2(vec2(-0.30,0.46),uLightA);
  col=mix(col,vec3(1.0),0.16*smoothstep(0.42,0.0,length((xy-wc)*vec2(1.0,2.1))));
  float caustic=smoothstep(0.58,0.84,edge)*(1.0-smoothstep(0.86,0.97,edge))*smoothstep(0.2,0.95,dot(normalize(xy+1e-5),normalize(-l2)));
  col=mix(col,uC4,0.18*caustic);
  col*=1.0-0.07*smoothstep(0.62,1.0,edge);
  gl_FragColor=vec4(col*alpha,alpha);
}`;
