// main.js
import { Model } from './Model.js';

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl',{antialias:true});
if(!gl){ alert('WebGL not supported'); throw new Error('no webgl'); }

function resize(){
  const dpr = Math.max(1, devicePixelRatio||1);
  const w = Math.floor(canvas.clientWidth*dpr), h = Math.floor(canvas.clientHeight*dpr);
  if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
}
addEventListener('resize', ()=>{ resize(); draw(); }); resize();

function compile(type, src){
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
  return s;
}
const vs = compile(gl.VERTEX_SHADER, document.getElementById('vs').textContent);
const fs = compile(gl.FRAGMENT_SHADER, document.getElementById('fs').textContent);
const prog = gl.createProgram(); gl.attachShader(prog,vs); gl.attachShader(prog,fs); gl.linkProgram(prog);
if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
gl.useProgram(prog);

const loc = {
  a_pos: gl.getAttribLocation(prog,'a_pos'),
  u_proj: gl.getUniformLocation(prog,'u_proj'),
  u_view: gl.getUniformLocation(prog,'u_view'),
  u_model: gl.getUniformLocation(prog,'u_model'),
  u_color: gl.getUniformLocation(prog,'u_color'),
};

function perspective(fovy,aspect,near,far){
  const f=1/Math.tan(fovy/2), nf=1/(near-far);
  return new Float32Array([ f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0 ]);
}
function lookAt(eye,center,up){
  let [ex,ey,ez]=eye,[cx,cy,cz]=center,[ux,uy,uz]=up;
  let zx=ex-cx,zy=ey-cy,zz=ez-cz; {let l=Math.hypot(zx,zy,zz); zx/=l; zy/=l; zz/=l;}
  let xx=uy*zz-uz*zy, yy=uz*zx-ux*zz, zzx=ux*zy-uy*zx; {let l=Math.hypot(xx,yy,zzx); xx/=l; yy/=l; zzx/=l;}
  ux=zy*zzx-zz*yy; uy=zz*xx-zx*zzx; uz=zx*yy-zy*xx;
  return new Float32Array([
    xx,ux,zx,0,  yy,uy,zy,0,  zzx,uz,zz,0,
    -(xx*ex+yy*ey+zzx*ez), -(ux*ex+uy*ey+uz*ez), -(zx*ex+zy*ey+zz*ez), 1
  ]);
}
const I4 = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

// камера-орбіта
let yaw=0.7, pitch=-0.25, dist=3.5, drag=false, lx=0, ly=0;
canvas.addEventListener('mousedown',e=>{drag=true; lx=e.clientX; ly=e.clientY;});
addEventListener('mouseup',()=>drag=false);
addEventListener('mousemove',e=>{
  if(!drag) return;
  const dx=(e.clientX-lx)/canvas.clientHeight*2*Math.PI;
  const dy=(e.clientY-ly)/canvas.clientHeight*2*Math.PI;
  lx=e.clientX; ly=e.clientY;
  yaw+=dx; pitch=Math.max(-1.3,Math.min(1.3,pitch+dy)); draw();
});
canvas.addEventListener('wheel',e=>{
  e.preventDefault(); dist=Math.max(2,Math.min(8,dist*Math.exp(-Math.sign(e.deltaY)*0.2))); draw();
},{passive:false});
function viewMat(){
  const cy=Math.cos(yaw), sy=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);
  const eye=[dist*cp*cy, dist*sp, dist*cp*sy];
  return lookAt(eye,[0,0,0],[0,1,0]);
}

// модель
const model = new Model(gl);

gl.clearColor(0.92,0.97,1.0,1.0);
gl.enable(gl.DEPTH_TEST);

function draw(){
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(prog);
  gl.uniformMatrix4fv(loc.u_proj,false, perspective(Math.PI/4, canvas.width/canvas.height, 0.05, 50));
  gl.uniformMatrix4fv(loc.u_view,false, viewMat());
  gl.uniformMatrix4fv(loc.u_model,false, I4);

  gl.lineWidth(1);       
  model.draw(prog, loc); 
}
draw();
