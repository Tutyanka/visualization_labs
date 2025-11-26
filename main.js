// main.js
import { Model } from './Model.js';

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', { antialias: true });
if (!gl) { alert('WebGL not supported'); throw new Error('no webgl'); }

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.clearColor(0.92, 0.97, 1.0, 1.0);

// ---------- resize ----------
function resize() {
  const dpr = Math.max(1, devicePixelRatio || 1);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
addEventListener('resize', () => { resize(); draw(); });
resize();

// ---------- tiny shader (grid) ----------
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
  return s;
}
function link(vsSrc, fsSrc) {
  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p);
  return p;
}
const VS_GRID = `
attribute vec3 a_pos;
uniform mat4 u_proj, u_view, u_model;
void main(){ gl_Position = u_proj * u_view * u_model * vec4(a_pos,1.0); }
`;
const FS_GRID = `
precision mediump float;
uniform vec3 u_color;
void main(){ gl_FragColor = vec4(u_color,1.0); }
`;
const progGrid = link(VS_GRID, FS_GRID);
const locGrid = {
  a_pos: gl.getAttribLocation(progGrid, 'a_pos'),
  u_proj: gl.getUniformLocation(progGrid, 'u_proj'),
  u_view: gl.getUniformLocation(progGrid, 'u_view'),
  u_model: gl.getUniformLocation(progGrid, 'u_model'),
  u_color: gl.getUniformLocation(progGrid, 'u_color'),
};

// yellow light marker
const VS_MARK = `
attribute vec3 a_pos;
uniform mat4 u_proj, u_view;
uniform float u_pointSize;
void main(){
  gl_Position = u_proj * u_view * vec4(a_pos,1.0);
  gl_PointSize = u_pointSize;
}
`;
const FS_MARK = `
precision mediump float;
uniform vec4 u_rgba;
void main(){
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  if(dot(uv,uv) > 1.0) discard;
  gl_FragColor = u_rgba;
}
`;
const progMark = link(VS_MARK, FS_MARK);
const locMark = {
  a_pos: gl.getAttribLocation(progMark, 'a_pos'),
  u_proj: gl.getUniformLocation(progMark, 'u_proj'),
  u_view: gl.getUniformLocation(progMark, 'u_view'),
  u_pointSize: gl.getUniformLocation(progMark, 'u_pointSize'),
  u_rgba: gl.getUniformLocation(progMark, 'u_rgba'),
};

// ---------- math ----------
function perspective(fovy, aspect, near, far){
  const f=1/Math.tan(fovy/2), nf=1/(near-far);
  return new Float32Array([ f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0 ]);
}
function lookAt(eye,center,up){
  let [ex,ey,ez]=eye,[cx,cy,cz]=center,[ux,uy,uz]=up;
  let zx=ex-cx, zy=ey-cy, zz=ez-cz; {let l=Math.hypot(zx,zy,zz); zx/=l; zy/=l; zz/=l;}
  let xx=uy*zz-uz*zy, yy=uz*zx-ux*zz, zzx=ux*zy-uy*zx; {let l=Math.hypot(xx,yy,zzx); xx/=l; yy/=l; zzx/=l;}
  ux=zy*zzx-zz*yy; uy=zz*xx-zx*zzx; uz=zx*yy-zy*xx;
  return new Float32Array([
    xx,ux,zx,0,  yy,uy,zy,0,  zzx,uz,zz,0,
    -(xx*ex+yy*ey+zzx*ez), -(ux*ex+uy*ey+uz*ez), -(zx*ex+zy*ey+zz*ez), 1
  ]);
}
const I4 = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

function mul4(a,b){
  const r=new Float32Array(16);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){
    r[i*4+j]=a[i*4+0]*b[0*4+j]+a[i*4+1]*b[1*4+j]+a[i*4+2]*b[2*4+j]+a[i*4+3]*b[3*4+j];
  }
  return r;
}
function inv4(m){
  const a=m, r=new Float32Array(16), b=new Float32Array(16);
  for(let i=0;i<16;i++){ r[i]=(i%5)==0?1:0; b[i]=a[i]; }
  for(let i=0;i<4;i++){
    let p=i; for(let j=i+1;j<4;j++) if(Math.abs(b[j*4+i])>Math.abs(b[p*4+i])) p=j;
    for(let j=0;j<4;j++){ let t=b[i*4+j]; b[i*4+j]=b[p*4+j]; b[p*4+j]=t; t=r[i*4+j]; r[i*4+j]=r[p*4+j]; r[p*4+j]=t; }
    const d=b[i*4+i], invd=1/d;
    for(let j=0;j<4;j++){ b[i*4+j]*=invd; r[i*4+j]*=invd; }
    for(let k=0;k<4;k++) if(k!==i){
      const f=b[k*4+i];
      for(let j=0;j<4;j++){ b[k*4+j]-=f*b[i*4+j]; r[k*4+j]-=f*r[i*4+j]; }
    }
  }
  return r;
}

// ---------- camera (orbit) ----------
let yaw=0.7, pitch=-0.25, dist=3.5;
let camEye=[0,0,0], camForward=[0,0,-1];
let rotatingCam=false, lastX=0, lastY=0;

function viewMat(){
  const cy=Math.cos(yaw), sy=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);
  const eye=[dist*cp*cy, dist*sp, dist*cp*sy];
  camEye = eye;
  const center=[0,0,0];
  const V = lookAt(eye, center, [0,1,0]);
  const f=[center[0]-eye[0], center[1]-eye[1], center[2]-eye[2]];
  const fl=Math.hypot(f[0],f[1],f[2])||1; camForward=[f[0]/fl,f[1]/fl,f[2]/fl];
  return V;
}

// ---------- model ----------
const model = new Model(gl, {
  segU: 48, segV: 48, inflate: 1.0,
  uAngles: (()=>{ const s=22*Math.PI/180, a=[0]; for(let t=s;t<2*Math.PI-1e-6;t+=s) a.push(t); return a; })(),
  zLines:  (()=>{ const N=28, eps=2/59, arr=[]; for(let i=0;i<N;i++){ const t=i/(N-1), z=-1+2*t; arr.push(Math.max(-1+eps, Math.min(1,z))); } return arr; })()
});

// ---------- light state + picking ----------
let lightPos = [2.0, 1.5, 2.0];
const lightVBO = gl.createBuffer();
let draggingLight = false;
let dragPlaneP = [...lightPos];
let dragPlaneN = [0,0,-1];
const HIT_RADIUS_WORLD = 0.45;
const MARKER_PX = 24.0;

// ВАЖЛИВО: рахуємо промінь у **пікселях canvas** (з урахуванням DPR)
function makeRayFromMouse(clientX, clientY, proj, view){
  const rect = canvas.getBoundingClientRect();
  const dpr  = Math.max(1, devicePixelRatio || 1);
  const px   = (clientX - rect.left) * dpr;
  const py   = (clientY - rect.top)  * dpr;

  const nx =  (px / canvas.width)  * 2 - 1;
  const ny =  1 - (py / canvas.height) * 2;

  const invPV = inv4(mul4(proj, view));
  const unproj = (x,y,z)=>{
    const v=[x,y,z,1];
    const m=invPV, o=[
      m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3],
      m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3],
      m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3],
      m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3]
    ];
    return [o[0]/o[3], o[1]/o[3], o[2]/o[3]];
  };
  const p0 = unproj(nx, ny, -1);
  const p1 = unproj(nx, ny,  1);
  const dir=[p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
  const dl=Math.hypot(dir[0],dir[1],dir[2])||1; dir[0]/=dl; dir[1]/=dl; dir[2]/=dl;
  return { origin: p0, dir };
}
function rayPlaneIntersect(rayO, rayD, planeP, planeN){
  const denom = planeN[0]*rayD[0]+planeN[1]*rayD[1]+planeN[2]*rayD[2];
  if (Math.abs(denom) < 1e-6) return null;
  const v=[planeP[0]-rayO[0], planeP[1]-rayO[1], planeP[2]-rayO[2]];
  const t=(v[0]*planeN[0]+v[1]*planeN[1]+v[2]*planeN[2])/denom;
  if (t<0) return null;
  return [rayO[0]+rayD[0]*t, rayO[1]+rayD[1]*t, rayO[2]+rayD[2]*t];
}
function raySphereIntersect(rayO, rayD, c, r){
  const oc=[rayO[0]-c[0], rayO[1]-c[1], rayO[2]-c[2]];
  const b = oc[0]*rayD[0] + oc[1]*rayD[1] + oc[2]*rayD[2];
  const c2 = oc[0]*oc[0] + oc[1]*oc[1] + oc[2]*oc[2] - r*r;
  const disc = b*b - c2;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

// ---------- pointer events ----------
canvas.style.cursor = 'default';

canvas.addEventListener('pointerdown', (e)=>{
  canvas.setPointerCapture(e.pointerId);
  lastX = e.clientX; lastY = e.clientY;

  const proj = perspective(Math.PI/4, canvas.width/canvas.height, 0.05, 50);
  const view = viewMat();
  const ray  = makeRayFromMouse(e.clientX, e.clientY, proj, view);

  const hit = raySphereIntersect(ray.origin, ray.dir, lightPos, HIT_RADIUS_WORLD);
  if (hit !== null){
    draggingLight = true;
    dragPlaneP = [...lightPos];
    dragPlaneN = [...camForward];      // площина паралельна екрану
    canvas.style.cursor = 'grabbing';
  } else {
    rotatingCam = true;
    canvas.style.cursor = 'grabbing';
  }
});
canvas.addEventListener('pointermove', (e)=>{
  const proj = perspective(Math.PI/4, canvas.width/canvas.height, 0.05, 50);
  const view = viewMat();

  if (draggingLight){
    const ray = makeRayFromMouse(e.clientX, e.clientY, proj, view);
    const p = rayPlaneIntersect(ray.origin, ray.dir, dragPlaneP, dragPlaneN);
    if (p){
      // обмежимо радіус, щоб не «тікало» далеко
      const r = Math.min(10.0, Math.hypot(p[0],p[1],p[2]));
      const rl = Math.hypot(p[0],p[1],p[2])||1;
      lightPos = [p[0]*r/rl, p[1]*r/rl, p[2]*r/rl];
      draw();
    }
    return;
  }

  if (rotatingCam){
    const dx=(e.clientX-lastX)/canvas.clientHeight*2*Math.PI;
    const dy=(e.clientY-lastY)/canvas.clientHeight*2*Math.PI;
    lastX=e.clientX; lastY=e.clientY;
    yaw += dx; pitch = Math.max(-1.3, Math.min(1.3, pitch+dy));
    draw();
    return;
  }

  // hover cursor (DPR-safe)
  const ray = makeRayFromMouse(e.clientX, e.clientY, proj, view);
  const hover = raySphereIntersect(ray.origin, ray.dir, lightPos, HIT_RADIUS_WORLD);
  canvas.style.cursor = hover ? 'grab' : 'default';
});
canvas.addEventListener('pointerup', (e)=>{
  try { canvas.releasePointerCapture(e.pointerId); } catch(_) {}
  draggingLight = false;
  rotatingCam = false;
  canvas.style.cursor = 'default';
});
canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  dist = Math.max(2, Math.min(8, dist * Math.exp(-Math.sign(e.deltaY)*0.2)));
  draw();
},{passive:false});

// ---------- draw ----------
function draw(){
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const proj = perspective(Math.PI/4, canvas.width/canvas.height, 0.05, 50);
  const view = viewMat();

  // grid
  gl.useProgram(progGrid);
  gl.uniformMatrix4fv(locGrid.u_proj, false, proj);
  gl.uniformMatrix4fv(locGrid.u_view, false, view);
  gl.uniformMatrix4fv(locGrid.u_model, false, I4);
  gl.uniform3f(locGrid.u_color, 0.95, 0.72, 0.15);
  model.draw(locGrid);

  // yellow light marker
  gl.bindBuffer(gl.ARRAY_BUFFER, lightVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lightPos), gl.DYNAMIC_DRAW);

  gl.useProgram(progMark);
  gl.uniformMatrix4fv(locMark.u_proj, false, proj);
  gl.uniformMatrix4fv(locMark.u_view, false, view);
  gl.uniform1f(locMark.u_pointSize, 24.0);
  gl.uniform4f(locMark.u_rgba, 1.0, 0.95, 0.2, 1.0);
  gl.enableVertexAttribArray(locMark.a_pos);
  gl.vertexAttribPointer(locMark.a_pos, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.POINTS, 0, 1);
}
draw();
