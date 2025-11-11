// model.js — містить ОКРЕМИЙ об’єкт Model для дротяної поверхні (U/V полілінії)
// Варіант: ding-dong  x^2 + y^2 = k (1 - z) z^2 ,  z ∈ [-1, 1]

export default class Model {
  constructor(gl, params){
    this.gl = gl;
    this.buffersU = [];   // набір буферів для U-поліліній (меридіани)
    this.buffersV = [];   // набір буферів для V-поліліній (паралелі)
    this.setParams(params);
    this.rebuild();
  }

  setParams(p){
    this.segU = p.segU|0;                 // дискретизація по куту (для всіх V-ліній)
    this.segV = p.segV|0;                 // дискретизація по висоті (для всіх U-ліній)
    this.k    = +p.inflate;               // коеф. надування/здування (k)
    this.uAngles = p.uAngles.slice(0);    // список фіксованих кутів для U-ліній
    this.zLines  = p.zLines.slice(0);     // список рівнів z для V-ліній
  }

  // рівняння варіанту: ding-dong
  static rOfZ(z,k){ const v=k*(1-z)*z*z; return v>0?Math.sqrt(v):0; }

  // плавна параметризація z — більше точок біля особливостей
  static smoothZ(i, segV){
    const t=i/segV;
    const ease = t*t*(3-2*t); // smoothstep
    return -1 + 2*ease;
  }

  _ensure(count, arr){
    const gl=this.gl;
    while(arr.length<count){
      const b=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,b);
      gl.bufferData(gl.ARRAY_BUFFER, 12, gl.DYNAMIC_DRAW);
      arr.push({buf:b,count:0});
    }
    while(arr.length>count){
      const last=arr.pop();
      gl.deleteBuffer(last.buf);
    }
  }

  rebuild(){
    const gl=this.gl;

    // --- U: меридіани (фіксуємо кут u, проходимо весь z ∈ [-1,1] з кроком segV) ---
    this._ensure(this.uAngles.length, this.buffersU);
    const eps=2/59;
    for(let idx=0; idx<this.uAngles.length; idx++){
      const u=this.uAngles[idx], cu=Math.cos(u), su=Math.sin(u);
      const verts=new Float32Array((this.segV+1)*3);
      for(let i=0;i<=this.segV;i++){
        const z  = Model.smoothZ(i, this.segV);
        const zc = Math.max(-1+eps, Math.min(1, z));
        const r  = Model.rOfZ(zc, this.k);
        const off=i*3;
        verts[off+0]=r*cu;
        verts[off+1]=r*su;
        verts[off+2]=zc;
      }
      const rec=this.buffersU[idx];
      gl.bindBuffer(gl.ARRAY_BUFFER,rec.buf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      rec.count=verts.length/3;
    }

    // --- V: паралелі (фіксуємо z, проходимо коло θ з кроком segU) ---
    this._ensure(this.zLines.length, this.buffersV);
    for(let idx=0; idx<this.zLines.length; idx++){
      const z0=this.zLines[idx];
      const r0=Model.rOfZ(z0,this.k);
      const verts=new Float32Array((this.segU+1)*3);
      for(let i=0;i<=this.segU;i++){
        const t=2*Math.PI*i/this.segU;
        const off=i*3;
        verts[off+0]=r0*Math.cos(t);
        verts[off+1]=r0*Math.sin(t);
        verts[off+2]=z0;
      }
      const rec=this.buffersV[idx];
      gl.bindBuffer(gl.ARRAY_BUFFER,rec.buf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      rec.count=verts.length/3;
    }
  }

  draw(locs){
    const gl=this.gl;
    gl.uniform3f(locs.u_color,0.95,0.72,0.15); // gold-ish
    gl.enableVertexAttribArray(locs.a_pos);

    const drawSet=(list)=>{
      for(const L of list){
        gl.bindBuffer(gl.ARRAY_BUFFER,L.buf);
        gl.vertexAttribPointer(locs.a_pos,3,gl.FLOAT,false,0,0);
        gl.drawArrays(gl.LINE_STRIP,0,L.count);
      }
    };
    // спочатку паралелі (V), потім меридіани (U) — сітка виглядає рівніше
    drawSet(this.buffersV);
    drawSet(this.buffersU);
  }
}
