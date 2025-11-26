// Model.js — дротяна поверхня Ding-dong: U (меридіани) та V (паралелі)
export class Model {
  constructor(gl, params){
    this.gl = gl;
    this.buffersU = [];
    this.buffersV = [];
    const defaults = {
      segU: 48, segV: 48, inflate: 1.0, uAngles: [0], zLines: [-1, -0.5, 0, 0.5, 1]
    };
    this.setParams(Object.assign({}, defaults, params||{}));
    this.rebuild();
  }

  setParams(p){
    this.segU = Math.max(6, p.segU|0);
    this.segV = Math.max(6, p.segV|0);
    this.k    = +p.inflate;
    this.uAngles = (p.uAngles||[0]).slice(0);
    this.zLines  = (p.zLines||[-1,0,1]).slice(0);
  }

  static rOfZ(z,k){ const v=k*(1.0 - z)*z*z; return v>0?Math.sqrt(v):0; }
  static smoothZ(i, segV){ const t=i/segV; const e=t*t*(3-2*t); return -1+2*e; }

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
    const eps=2/59;

    // U-меридіани
    this._ensure(this.uAngles.length, this.buffersU);
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
      gl.bindBuffer(gl.ARRAY_BUFFER, rec.buf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      rec.count=verts.length/3;
    }

    // V-паралелі
    this._ensure(this.zLines.length, this.buffersV);
    for(let idx=0; idx<this.zLines.length; idx++){
      const z0=this.zLines[idx];
      const r0=Model.rOfZ(z0, this.k);
      const verts=new Float32Array((this.segU+1)*3);
      for(let i=0;i<=this.segU;i++){
        const t=2*Math.PI*i/this.segU;
        const off=i*3;
        verts[off+0]=r0*Math.cos(t);
        verts[off+1]=r0*Math.sin(t);
        verts[off+2]=z0;
      }
      const rec=this.buffersV[idx];
      gl.bindBuffer(gl.ARRAY_BUFFER, rec.buf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      rec.count=verts.length/3;
    }
  }

  draw(locs){
    const gl=this.gl;
    gl.enableVertexAttribArray(locs.a_pos);

    const drawSet=(list)=>{
      for(const L of list){
        gl.bindBuffer(gl.ARRAY_BUFFER, L.buf);
        gl.vertexAttribPointer(locs.a_pos, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINE_STRIP, 0, L.count);
      }
    };
    // спочатку паралелі, потім меридіани
    drawSet(this.buffersV);
    drawSet(this.buffersU);
  }
}
