(() => {
  "use strict";
  const FAR_Z=-48, PLAYER_Z=2.8, PLAYER_DEPTH=.82, LANE_GAP=2.65, TRACK_SPAN=(PLAYER_Z-FAR_Z)/PLAYER_DEPTH;
  const CLEAR=[.48,.69,.84,1];

  function shader(gl,type,source){
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(s)||"Shader compilation failed";gl.deleteShader(s);throw new Error(e);}
    return s;
  }
  function programFor(gl){
    const vs=[
      "attribute vec3 aPosition;","attribute vec3 aNormal;",
      "uniform mat4 uProjection;","uniform mat4 uView;","uniform mat4 uModel;","uniform mat3 uNormal;",
      "varying vec3 vNormal;","varying vec3 vWorld;","varying vec3 vViewPosition;",
      "void main(){",
      "vec4 world=uModel*vec4(aPosition,1.0);","vec4 vp=uView*world;",
      "vWorld=world.xyz;vViewPosition=vp.xyz;vNormal=normalize(uNormal*aNormal);",
      "gl_Position=uProjection*vp;","}"
    ].join("\n");
    const fs=[
      "precision mediump float;","uniform vec3 uColor;","uniform vec3 uCamera;","uniform vec3 uLight;",
      "uniform float uMetal;","uniform float uEmissive;","uniform float uFogNear;","uniform float uFogFar;",
      "varying vec3 vNormal;","varying vec3 vWorld;","varying vec3 vViewPosition;",
      "void main(){",
      "vec3 N=normalize(vNormal);vec3 L=normalize(uLight);vec3 V=normalize(uCamera-vWorld);vec3 H=normalize(L+V);",
      "float dif=max(dot(N,L),0.0);float spec=pow(max(dot(N,H),0.0),mix(18.0,72.0,uMetal))*(.12+uMetal*.42);",
      "float rim=pow(1.0-max(dot(N,V),0.0),2.0)*.12;",
      "vec3 lit=uColor*(.36+dif*.78)+vec3(spec+rim+uEmissive);",
      "float fog=smoothstep(uFogNear,uFogFar,length(vViewPosition));",
      "gl_FragColor=vec4(mix(lit,vec3(.52,.69,.79),fog),1.0);","}"
    ].join("\n");
    const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));
    gl.bindAttribLocation(p,0,"aPosition");gl.bindAttribLocation(p,1,"aNormal");gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||"Program link failed");
    return {p,projection:gl.getUniformLocation(p,"uProjection"),view:gl.getUniformLocation(p,"uView"),model:gl.getUniformLocation(p,"uModel"),normal:gl.getUniformLocation(p,"uNormal"),color:gl.getUniformLocation(p,"uColor"),camera:gl.getUniformLocation(p,"uCamera"),light:gl.getUniformLocation(p,"uLight"),metal:gl.getUniformLocation(p,"uMetal"),emissive:gl.getUniformLocation(p,"uEmissive"),fogNear:gl.getUniformLocation(p,"uFogNear"),fogFar:gl.getUniformLocation(p,"uFogFar")};
  }
  const I=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
  function T(x,y,z){const m=I();m[12]=x;m[13]=y;m[14]=z;return m;}
  function S(x,y,z){const m=I();m[0]=x;m[5]=y;m[10]=z;return m;}
  function RX(a){const c=Math.cos(a),s=Math.sin(a),m=I();m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;}
  function RY(a){const c=Math.cos(a),s=Math.sin(a),m=I();m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;}
  function RZ(a){const c=Math.cos(a),s=Math.sin(a),m=I();m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m;}
  function model(pos,scale,rot=[0,0,0]){let m=T(...pos);m=mul(m,RZ(rot[2]||0));m=mul(m,RY(rot[1]||0));m=mul(m,RX(rot[0]||0));return mul(m,S(...scale));}
  function proj(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
  function norm(v){const n=Math.hypot(...v)||1;return v.map(x=>x/n);}
  function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function lookAt(eye,target,up){const z=norm(eye.map((x,i)=>x-target[i])),x=norm(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function nm(m){const a00=m[0],a01=m[4],a02=m[8],a10=m[1],a11=m[5],a12=m[9],a20=m[2],a21=m[6],a22=m[10];const b01=a22*a11-a12*a21,b11=-a22*a10+a12*a20,b21=a21*a10-a11*a20;let d=a00*b01+a01*b11+a02*b21;if(!d)d=1;d=1/d;return new Float32Array([b01*d,(-a22*a01+a02*a21)*d,(a12*a01-a02*a11)*d,b11*d,(a22*a00-a02*a20)*d,(-a12*a00+a02*a10)*d,b21*d,(-a21*a00+a01*a20)*d,(a11*a00-a01*a10)*d]);}
  function mesh(gl,p,n){const data=new Float32Array(p.length*2);for(let i=0;i<p.length/3;i++){data.set(p.slice(i*3,i*3+3),i*6);data.set(n.slice(i*3,i*3+3),i*6+3);}const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return{buffer:b,count:p.length/3};}
  function parseGLB(gl,buffer){
    const view=new DataView(buffer);
    if(view.getUint32(0,true)!==0x46546c67)throw new Error("Invalid GLB");
    const jsonLength=view.getUint32(12,true);
    const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength)));
    const binHeader=20+jsonLength;
    const binLength=view.getUint32(binHeader,true);
    const bin=new Uint8Array(buffer,binHeader+8,binLength);
    const componentInfo={5121:[Uint8Array,1],5123:[Uint16Array,2],5125:[Uint32Array,4],5126:[Float32Array,4]};
    const componentCount={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
    function accessor(index){
      const a=json.accessors[index],bv=json.bufferViews[a.bufferView],info=componentInfo[a.componentType],count=componentCount[a.type];
      const offset=(bv.byteOffset||0)+(a.byteOffset||0),stride=bv.byteStride||info[1]*count;
      const out=new Array(a.count*count),dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
      for(let i=0;i<a.count;i++)for(let c=0;c<count;c++){
        const at=offset+i*stride+c*info[1];
        out[i*count+c]=a.componentType===5126?dv.getFloat32(at,true):a.componentType===5125?dv.getUint32(at,true):a.componentType===5123?dv.getUint16(at,true):dv.getUint8(at);
      }
      return out;
    }
    const materials=json.materials||[],parts=[];
    for(const group of json.meshes||[])for(const primitive of group.primitives||[]){
      if(primitive.mode!==undefined&&primitive.mode!==4)continue;
      const raw=accessor(primitive.attributes.POSITION),normals=primitive.attributes.NORMAL!==undefined?accessor(primitive.attributes.NORMAL):null;
      const indices=primitive.indices!==undefined?accessor(primitive.indices):Array.from({length:raw.length/3},(_,i)=>i);
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<raw.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],raw[i+k]);max[k]=Math.max(max[k],raw[i+k]);}
      const center=min.map((v,k)=>(v+max[k])*.5),extent=Math.max(...max.map((v,k)=>v-min[k]),.001);
      const p=[],n=[];
      for(let i=0;i+2<indices.length;i+=3){
        const tri=indices.slice(i,i+3),verts=tri.map(idx=>[0,1,2].map(k=>(raw[idx*3+k]-center[k])*2/extent));
        let face;
        if(!normals){const u=verts[1].map((v,k)=>v-verts[0][k]),v=verts[2].map((x,k)=>x-verts[0][k]);face=norm([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]);}
        for(let j=0;j<3;j++){p.push(...verts[j]);n.push(...(normals?normals.slice(tri[j]*3,tri[j]*3+3):face));}
      }
      if(!p.length)continue;
      const mat=materials[primitive.material]||{},base=mat.pbrMetallicRoughness?.baseColorFactor||[.78,.72,.61,1];
      parts.push({mesh:mesh(gl,p,n),color:base.slice(0,3),metal:mat.pbrMetallicRoughness?.metallicFactor||0});
    }
    return parts;
  }
  function cube(gl){const p=[],n=[],faces=[[[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],[[0,0,-1],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]],[[1,0,0],[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]],[[-1,0,0],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]],[[0,1,0],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]],[[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]]];for(const [nn,v] of faces)for(const k of [0,1,2,0,2,3]){p.push(...v[k]);n.push(...nn);}return mesh(gl,p,n);}
  function sphere(gl,rows=16,cols=22){const p=[],n=[];const q=(u,v)=>{const ph=v*Math.PI,th=u*Math.PI*2;return[Math.sin(ph)*Math.cos(th),Math.cos(ph),Math.sin(ph)*Math.sin(th)];};for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=q(x/cols,y/rows),b=q(x/cols,(y+1)/rows),c=q((x+1)/cols,(y+1)/rows),d=q((x+1)/cols,y/rows);for(const v of [a,b,d,d,b,c]){p.push(...v);n.push(...v);}}return mesh(gl,p,n);}
  function cylinder(gl,segments=20,top=1,bottom=1){const p=[],n=[];for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;const p0=[Math.cos(a)*bottom,-1,Math.sin(a)*bottom],p1=[Math.cos(a)*top,1,Math.sin(a)*top],p2=[Math.cos(b)*top,1,Math.sin(b)*top],p3=[Math.cos(b)*bottom,-1,Math.sin(b)*bottom],n0=norm([Math.cos(a),(bottom-top)/2,Math.sin(a)]),n1=norm([Math.cos(b),(bottom-top)/2,Math.sin(b)]);for(const [v,nn] of [[p0,n0],[p1,n0],[p2,n1],[p0,n0],[p2,n1],[p3,n1]]){p.push(...v);n.push(...nn);}}return mesh(gl,p,n);}

  function create(canvas){
    const gl=canvas.getContext("webgl",{alpha:false,antialias:true,depth:true,powerPreference:"high-performance"})||canvas.getContext("experimental-webgl");
    if(!gl)throw new Error("WebGL is unavailable");
    const sh=programFor(gl),cubeMesh=cube(gl),sphereMesh=sphere(gl),cyl=cylinder(gl),taper=cylinder(gl,24,.78,1),cone=cylinder(gl,24,0,1);
    const camera=[0,5.7,11.4],target=[0,-.4,-15];
    const powder=[[.65,.28,.12],[.60,.39,.16],[.90,.58,.08],[.72,.38,.17],[.42,.20,.12],[.21,.18,.16],[.75,.15,.08],[.90,.68,.20],[.55,.20,.10]];
    let projection=proj(58*Math.PI/180,16/9,.1,150),view=lookAt(camera,target,[0,1,0]),drawCount=0;
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.clearColor(...CLEAR);gl.useProgram(sh.p);
    gl.uniform3fv(sh.camera,camera);gl.uniform3fv(sh.light,[-.42,.82,.36]);gl.uniform1f(sh.fogNear,30);gl.uniform1f(sh.fogFar,74);
    function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1)),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);projection=proj(58*Math.PI/180,w/h,.1,150);}
    function draw(m,pos,scale,color,rot=[0,0,0],metal=0,emissive=0){const M=model(pos,scale,rot);gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);gl.enableVertexAttribArray(0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);gl.uniformMatrix4fv(sh.model,false,M);gl.uniformMatrix3fv(sh.normal,false,nm(M));gl.uniform3fv(sh.color,color);gl.uniform1f(sh.metal,metal);gl.uniform1f(sh.emissive,emissive);gl.drawArrays(gl.TRIANGLES,0,m.count);drawCount++;}
    const box=(p,s,c,r=[0,0,0],metal=0)=>draw(cubeMesh,p,s,c,r,metal);
    const assetDefs={
      crate:"/assets/game/kenney-crate.glb",
      barrier:"/assets/game/kenney-barrier.glb",
      awning:"/assets/game/kenney-awning.glb",
      building:"/assets/game/kenney-market-building.glb",
      bottle:"/assets/game/kenney-spice-bottle.glb",
      character:"/assets/game/kenney-character-male-a.glb",
      palm:"/assets/game/kenney-palm.glb",
      barrel:"/assets/game/kenney-spice-barrel.glb",
      bowl:"/assets/game/kenney-spice-bowl.glb",
      coin:"/assets/game/kenney-coin-reference.glb"
    };
    const assets={};
    const assetLoads=Object.entries(assetDefs).map(async([name,url])=>{
      try{const response=await fetch(url);if(!response.ok)throw new Error("HTTP "+response.status);assets[name]=parseGLB(gl,await response.arrayBuffer());}
      catch(error){console.warn("[Zarad assets] Could not load "+name,error);}
    });
    Promise.all(assetLoads).then(()=>{console.info("[Zarad assets] Loaded",Object.keys(assets));});
    function assetAt(name,pos,scale,override,rot=[0,0,0]){
      const parts=assets[name];if(!parts||!parts.length)return false;
      for(const part of parts)draw(part.mesh,pos,[scale,scale,scale],override||part.color,rot,part.metal||0);
      return true;
    }
    const ball=(p,s,c,metal=0,em=0)=>draw(sphereMesh,p,s,c,[0,0,0],metal,em);
    const tube=(p,s,c,r=[0,0,0],metal=0,em=0)=>draw(cyl,p,s,c,r,metal,em);
    function line(a,b,r,c){const d=norm([b[0]-a[0],b[1]-a[1],b[2]-a[2]]),len=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]),dp=Math.max(-1,Math.min(1,d[1])),axis=cross([0,1,0],d),al=Math.hypot(...axis);let rot=[0,0,0];if(al>1e-5){const ang=Math.acos(dp),ax=axis[0]/al,ay=axis[1]/al,az=axis[2]/al,qx=ax*Math.sin(ang/2),qy=ay*Math.sin(ang/2),qz=az*Math.sin(ang/2),qw=Math.cos(ang/2);const sr=2*(qw*qx+qy*qz),cr=1-2*(qx*qx+qy*qy),sp=2*(qw*qy-qz*qx),sy=2*(qw*qz+qx*qy),cy=1-2*(qy*qy+qz*qz);rot=[Math.atan2(sr,cr),Math.asin(Math.max(-1,Math.min(1,sp))),Math.atan2(sy,cy)];}else if(dp<0)rot=[Math.PI,0,0];draw(cyl,[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],[r,len/2,r],c,rot);}

    function arch(z){const base=3.6,rad=5.8,th=.25;box([-5.7,1.8,z],[th,1.8,th],[.71,.43,.30]);box([5.7,1.8,z],[th,1.8,th],[.71,.43,.30]);for(let i=0;i<8;i++){const a=Math.PI-i/8*Math.PI,b=Math.PI-(i+1)/8*Math.PI;line([Math.cos(a)*rad,base+Math.sin(a)*rad,z],[Math.cos(b)*rad,base+Math.sin(b)*rad,z],th,[.83,.63,.39]);}box([0,.14,z],[5.9,.14,.24],[.78,.55,.32]);}
    function stall(side,z,v){const x=side*7.7;if(assets.character)assetAt("character",[x,.0,z+1.35],.68);if(assets.building)assetAt("building",[x,1.45,z],1.65);else box([x,1.45,z],[1.35,1.45,2],[.53,.25,.19]);if(!assetAt("awning",[x,2.95,z],.9))box([x,2.95,z],[1.5,.13,2.1],[.78,.55,.34]);const stripe=[[.59,.15,.16],[.88,.69,.39],[.91,.83,.66],[.25,.37,.27]];box([x,2.95,z+1.05],[1.58,.12,1.2],[.56,.19,.18]);for(let i=0;i<8;i++)box([x-1.4+i*.4,2.95,z+1.08],[.20,.125,1.24],stripe[(i+v)%4]);for(let tier=0;tier<2;tier++){box([x,1.08+tier*.56,z+2.0],[1.32,.08,.12],[.68,.43,.24]);for(let j=0;j<3;j++){const xx=x-.62+j*.62,col=powder[(j+tier*3+v)%powder.length];if(!assetAt("bowl",[xx,1.30+tier*.56,z+1.96],.20,col))tube([xx,1.34+tier*.56,z+1.96],[.12,.18,.12],col);tube([xx,1.55+tier*.56,z+1.96],[.13,.035,.13],[.83,.63,.31],[0,0,0],.7);}}const lx=x-side*1.65;line([lx,4.1,z+.8],[lx,3.62,z+.8],.025,[.18,.14,.12]);tube([lx,3.42,z+.8],[.14,.21,.14],[.85,.51,.16],[0,0,0],.7,.08);ball([lx,3.42,z+.8],[.09,.16,.09],[1,.66,.25],.2,.15);}
    function palm(x,z,phase){if(assetAt("palm",[x,1.65,z],1.35))return;line([x,0,z],[x-.1,2.4,z],.14,[.34,.22,.13]);line([x-.1,2.4,z],[x+.1,3.85,z],.11,[.39,.26,.14]);for(let i=0;i<6;i++){const a=i/6*Math.PI*2+phase,len=1.8+(i%3)*.2,end=[x+.1+Math.cos(a)*len,3.72-Math.abs(Math.sin(a))*.7,z+Math.sin(a)*len];line([x+.1,3.75,z],end,.055,[.17,.34,.19]);}}
    function market(now){box([0,-.48,-17],[22,.38,72],[.64,.43,.30]);box([0,-.27,-19],[14,.12,62],[.36,.29,.24]);box([0,3,-48],[18,3,.55],[.75,.48,.30]);box([0,2.1,-47.35],[3.25,2.2,.08],[.21,.13,.12]);for(const side of [-1,1]){box([side*10.1,2.4,-27],[2.9,2.5,9],[.67,.40,.26]);for(let z=-21;z>=-43;z-=10){box([side*8.7,2.8,z],[.72,2.8,2],[.72,.4,.24]);box([side*8.15,2.2,z+1.02],[.05,.6,.06],[.17,.12,.1]);}}arch(-24);arch(-43);for(const side of [-1,1])for(let i=0;i<2;i++){const z=-7-i*20;stall(side,z,i);palm(side*10.2,z-3,Math.sin(now*.0005+i));ball([side*6.35,.4,z+3],[.52,.43,.54],[.72,.28,.13]);ball([side*7.0,.35,z+3.5],[.49,.4,.5],[.86,.57,.12]);}}
    function tracks(scroll){for(let lane=-1;lane<=1;lane++){const x=lane*LANE_GAP;box([x,-.02,-20],[1.36,.18,48],[.34,.29,.24]);box([x,-.12,-20],[1.2,.06,47],[.46,.34,.26]);for(const side of [-1,1]){const rx=x+side*.65;box([rx,.13,-20],[.085,.16,52],[.48,.51,.54],[0,0,0],.82);box([rx-.018,.218,-20],[.025,.025,52],[.84,.85,.82],[0,0,0],.9);}for(let i=0;i<24;i++){const d=(i/24+scroll)%1,z=FAR_Z+d*TRACK_SPAN,s=.34+d*.86;box([x,.04,z],[1.32*s,.095*s,.30*s],[.34,.20,.12],[0,0,0],.15);}for(let i=0;i<8;i++)for(const side of [-1,1])ball([x+side*.9,.1,-46+i*6.4],[.08,.055,.09],[.30,.27,.23]);}}
    function crate(x,z,s){if(assetAt("crate",[x,.72*s,z],.72*s))return;box([x,.68*s,z],[.72*s,.68*s,.68*s],[.53,.29,.14]);box([x,.68*s,z+.35*s],[.64*s,.58*s,.055*s],[.68,.43,.24]);for(let i=-2;i<=2;i++)box([x+i*.26*s,.68*s,z+.415*s],[.035*s,.56*s,.014*s],[.40,.22,.12]);box([x,.68*s,z+.435*s],[.38*s,.27*s,.018*s],[.28,.13,.1]);ball([x,.77*s,z+.46*s],[.09*s,.09*s,.018*s],[.87,.62,.27],.3);}
    function barrier(x,z,s){if(assetAt("barrier",[x,.62*s,z],.72*s))return;for(const side of [-1,1]){box([x+side*.52*s,.42*s,z],[.12*s,.45*s,.16*s],[.35,.20,.12]);box([x+side*.52*s,.15*s,z],[.22*s,.06*s,.36*s],[.3,.18,.12]);}box([x,.87*s,z],[1.24*s,.28*s,.24*s],[.86,.78,.6]);for(let i=-3;i<=3;i++)box([x+i*.17*s,.87*s,z+.13*s],[.085*s,.28*s,.018*s],i%2?[.62,.12,.1]:[.91,.82,.64],[0,0,-.42]);}
    function awning(x,z,s){for(const side of [-1,1])box([x+side*.65*s,1.02*s,z],[.12*s,1.02*s,.12*s],[.35,.18,.12]);box([x,1.95*s,z],[1.62*s,.18*s,.72*s],[.61,.18,.16]);for(let i=-3;i<=3;i++)box([x+i*.22*s,1.87*s,z],[.12*s,.06*s,.73*s],i%2?[.91,.76,.51]:[.93,.88,.73]);}
    function train(x,z,s){box([x,1.28*s,z],[1.2*s,1.28*s,2.25*s],[.47,.12,.15]);box([x,2.35*s,z-.1*s],[1.1*s,.22*s,1.9*s],[.86,.78,.59]);box([x,1.58*s,z+1.14*s],[.88*s,.75*s,.035*s],[.10,.18,.22]);box([x,1.58*s,z+1.19*s],[.79*s,.63*s,.025*s],[.17,.30,.36]);box([x,1.05*s,z+1.2*s],[.54*s,.24*s,.035*s],[.84,.65,.30]);for(const side of [-1,1]){ball([x+side*.82*s,1*s,z+1.2*s],[.12*s,.12*s,.07*s],[1,.82,.38],.7,.1);tube([x+side*.74*s,.3*s,z+.65*s],[.2*s,.1*s,.2*s],[.13,.12,.12],[Math.PI/2,0,0],.6);tube([x+side*.74*s,.3*s,z-.55*s],[.2*s,.1*s,.2*s],[.13,.12,.12],[Math.PI/2,0,0],.6);}}
    function coin(x,z,time,s){
      const y=1.08+Math.sin(time*.006+z)*.11,spin=time*.0028;
      // Kenney's CC0 coin mesh is the physical pickup; Zarad gold and star
      // detailing make it read as the in-game currency, not Subway's coin art.
      if(assetAt("coin",[x,y,z],.46*s,[1,.69,.12],[0,spin,Math.PI/2])){
        ball([x,y,z+.04*s],[.10*s,.10*s,.045*s],[.73,.19,.13],.32,.08);
        ball([x,y,z+.075*s],[.045*s,.045*s,.025*s],[1,.88,.48],.55,.18);
        return;
      }
      tube([x,y,z],[.34*s,.075*s,.34*s],[1,.70,.08],[Math.PI/2,0,spin],.82,.22);
      tube([x,y,z+.008],[.23*s,.079*s,.23*s],[.96,.48,.035],[Math.PI/2,0,spin],.76,.10);
      ball([x-.10*s,y+.10*s,z+.045*s],[.035*s,.11*s,.025*s],[1,.91,.48],.5,.12);
    }
    function jar(x,z,index,time,s){const c=powder[index%powder.length],bob=Math.sin(time*.005+index)*.12,spin=time*.0011,y=1.05+bob;if(assetAt("bottle",[x,y,z],.43*s,c))return;tube([x,y,z],[.23*s,.31*s,.23*s],c,[0,spin,0],.18,.02);tube([x,y-.05*s,z+.005],[.235*s,.18*s,.235*s],[.90,.77,.57],[0,spin,0],.12);tube([x,y+.31*s,z],[.16*s,.08*s,.16*s],[.74,.45,.18],[0,spin,0],.68,.04);tube([x,y+.43*s,z],[.19*s,.065*s,.19*s],[.91,.70,.34],[0,spin,0],.78);ball([x-.09*s,y+.18*s,z+.205*s],[.035*s,.20*s,.018*s],[1,.93,.77],.25,.02);ball([x,y+.52*s,z],[.045*s,.028*s,.045*s],[.98,.78,.34],.65,.04);}
    function powerup(x,z,kind,time,s){
      const color=kind==="boost-magnet"?[.22,.70,.48]
        :kind==="boost-jetpack"?[.95,.43,.14]
        :kind==="boost-sneakers"?[.98,.70,.16]
        :kind==="boost-hoverboard"||kind==="boost-shield"?[.35,.62,.92]
        :kind==="boost-x2"?[.67,.35,.82]:[.91,.61,.16];
      const bob=Math.sin(time*.004+z)*.14,y=1.22+bob;
      ball([x,y,z],[.46*s,.46*s,.46*s],color,.45,.20);
      if(assets.bottle)assetAt("bottle",[x,y,z],.68*s,color,[0,time*.001,0]);
      else tube([x,y,z],[.18*s,.32*s,.18*s],color,[0,time*.001,0],.2,.16);
      tube([x,y-.32*s,z],[.52*s,.035*s,.52*s],[.96,.80,.40],[Math.PI/2,0,0],.62,.12);
      ball([x,y+.47*s,z],[.09*s,.09*s,.09*s],[1,.91,.56],.48,.35);
    }
    function guard(lane,pressure,now){
      if(!assets.character||pressure<=.12)return;
      const gap=2.35+(1-pressure)*1.35;
      assetAt("character",[lane*LANE_GAP,1.02,PLAYER_Z+gap],.72);
    }
    function runner(lane,jumpTime,slideTime,now,jumpHeight,boostState){
      const x=lane*LANE_GAP;
      const jumping=jumpTime>0,sliding=slideTime>0;
      const progress=jumping?Math.min(1,jumpTime/.78):0;
      const lift=jumping?(Number.isFinite(jumpHeight)?jumpHeight:Math.sin(progress*Math.PI)*1.3):0;
      const bob=jumping||sliding?0:Math.abs(Math.sin(now*.014))*.04;
      const base=lift+bob;
      const bodyBase=base-(sliding?.46:0);
      const phase=now*.0115;
      const lean=sliding?.42:jumping?-.10:-.055;

      // Soft oval contact shadow remains on the track while the runner jumps.
      ball([x,.035,PLAYER_Z],[.57*Math.max(.48,1-lift*.45),.035,.42],[.07,.045,.035]);

      // Subway-style hoverboard protection, recoloured to the Zarad palette.
      if(boostState&&boostState.hoverboard>0){
        box([x,.19+lift*.06,PLAYER_Z],[.88,.085,.34],[.58,.13,.18],[0,now*.0018,0],.62);
        box([x,.255+lift*.06,PLAYER_Z],[.62,.018,.23],[.96,.72,.30],[0,now*.0018,0],.72);
        for(const side of [-1,1]){
          ball([x+side*.40,.16+lift*.06,PLAYER_Z-.10],[.07,.035,.09],[.92,.37,.17],.45,.25);
        }
      }

      // Jetpack exhaust gives the flight boost a visible state.
      if(boostState&&boostState.jetpack>0){
        for(const side of [-1,1]){
          const fx=x+side*.26, fy=1.25+lift, fz=PLAYER_Z+.28;
          tube([fx,fy,fz],[.095,.28,.095],[.86,.34,.12],[0,0,0],.18,.30);
          ball([fx,fy-.30,fz],[.085,.13,.085],[1,.73,.24],.12,.45);
        }
      }

      // A two-link IK-style gait: hip rotation drives the thigh and the knee
      // flex independently folds the shin. The two legs stay parallel on X.
      for(const side of [-1,1]){
        const ph=phase+(side===1?Math.PI:0);
        const hipAngle=sliding?side*-.16:jumping?Math.sin(ph)*.27:Math.sin(ph)*.62;
        const kneeFlex=sliding?1.02:jumping?.52:Math.max(0,Math.cos(ph))*.86;
        const hipX=x+side*.20;
        const hip=[hipX,(sliding?.77:1.0)+base,PLAYER_Z];
        const upperLength=.47,lowerLength=.43;
        const knee=[
          hipX,
          hip[1]-Math.cos(hipAngle)*upperLength,
          PLAYER_Z+Math.sin(hipAngle)*upperLength
        ];
        const shinAngle=hipAngle-kneeFlex;
        const ankle=[
          hipX,
          knee[1]-Math.cos(shinAngle)*lowerLength,
          knee[2]+Math.sin(shinAngle)*lowerLength
        ];

        line(hip,knee,.145,[.19,.12,.14]);
        ball(knee,[.15,.15,.15],[.29,.18,.18]);
        line(knee,ankle,.105,[.22,.14,.16]);
        ball(ankle,[.105,.105,.105],[.22,.14,.15]);

        const shoeY=ankle[1]+.025;
        const shoeZ=ankle[2]+.12;
        const shoePitch=shinAngle*.34;
        box([ankle[0],shoeY,shoeZ],[.18,.115,.31],[.91,.83,.70],[shoePitch,0,0],.06);
        box([ankle[0],shoeY-.07,shoeZ],[.19,.045,.32],[.39,.20,.18],[shoePitch,0,0]);
        box([ankle[0],shoeY+.035,shoeZ-.015],[.09,.018,.20],[.70,.12,.15],[shoePitch,0,0]);
        for(let lace=0;lace<3;lace++){
          box([ankle[0],shoeY+.075,shoeZ-.09+lace*.07],[.105,.012,.012],[.45,.28,.21],[shoePitch,0,0]);
        }
      }

      // Pelvis, torso and hood sit on the same lowered base during a slide.
      box([x,1+bodyBase,PLAYER_Z],[.43,.25,.30],[.25,.14,.16],[lean,0,0]);
      draw(taper,[x,1.52+bodyBase,PLAYER_Z],[.43,.57,.31],[.91,.82,.69],[lean,0,0],0,.01);
      box([x,1.32+bodyBase,PLAYER_Z+.015],[.66,.16,.36],[.91,.82,.69],[lean,0,0]);
      // Burgundy back patch and raised gold flower medallion.
      box([x,1.54+bodyBase,PLAYER_Z+.322],[.22,.26,.018],[.49,.16,.18]);
      ball([x,1.67+bodyBase,PLAYER_Z+.344],[.085,.085,.018],[.91,.65,.27],.48);
      for(let i=0;i<8;i++){
        const angle=i*Math.PI/4;
        ball([x+Math.cos(angle)*.105,1.67+bodyBase+Math.sin(angle)*.105,PLAYER_Z+.342],[.035,.035,.018],[.69,.23,.17],.25);
      }
      box([x,1.08+bodyBase,PLAYER_Z+.02],[.66,.10,.34],[.47,.14,.17]);
      ball([x,1.91+bodyBase,PLAYER_Z+.04],[.34,.27,.29],[.78,.68,.55]);
      tube([x,2.03+bodyBase,PLAYER_Z],[.15,.18,.15],[.66,.40,.28]);
      ball([x,2.34+bodyBase,PLAYER_Z],[.31,.37,.29],[.67,.39,.27]);
      // Rear hair, burgundy cap and gold Zarad star.
      ball([x,2.46+bodyBase,PLAYER_Z+.045],[.315,.25,.30],[.12,.095,.09]);
      ball([x,2.59+bodyBase,PLAYER_Z-.02],[.34,.17,.32],[.48,.12,.16]);
      ball([x,2.61+bodyBase,PLAYER_Z+.12],[.28,.065,.24],[.63,.17,.20]);
      ball([x,2.58+bodyBase,PLAYER_Z+.255],[.07,.07,.018],[.97,.74,.34],.55);

      // Scarf collar and separate cloth tails moving in the wake.
      box([x,1.96+bodyBase,PLAYER_Z+.24],[.44,.13,.14],[.53,.16,.19],[.12,0,0]);
      const wave=Math.sin(now*.009)*.14;
      for(let tail=0;tail<2;tail++){
        const side=tail===0?-1:1;
        for(let k=0;k<4;k++){
          const z=PLAYER_Z+.34+k*.18;
          const y=1.94+bodyBase-k*.085+Math.sin(now*.009+k*.75+tail)*.045;
          const xx=x+side*(.12+k*.04)+wave*k*.18;
          box([xx,y,z],[.13,.045,.20],k%2?[.62,.25,.22]:[.46,.10,.16],[.06,wave+side*.03,side*.10]);
          box([xx,y-.025,z+.015],[.13,.012,.18],[.87,.64,.30]);
        }
      }

      // Arms counter-swing to the legs. During a jump the shoulders and hands lift.
      const armLift=jumping?.34:sliding?-.12:0;
      for(const side of [-1,1]){
        const swing=sliding?side*.75:jumping?-.56*side:Math.sin(phase+(side===1?0:Math.PI))*.42;
        const shoulder=[x+side*.43,1.77+bodyBase+armLift,PLAYER_Z];
        const elbow=[x+side*.59,1.34+bodyBase+armLift,PLAYER_Z+Math.sin(swing)*.24];
        const wrist=[x+side*.60,.99+bodyBase+armLift,PLAYER_Z+Math.sin(swing)*.42];
        line(shoulder,elbow,.115,[.89,.81,.68]);
        ball(elbow,[.115,.115,.115],[.68,.40,.28]);
        line(elbow,wrist,.09,[.86,.78,.65]);
        ball(wrist,[.10,.10,.10],[.67,.39,.27]);
      }
    }
    function objectZ(d){return FAR_Z+(d/PLAYER_DEPTH)*(PLAYER_Z-FAR_Z);}
    function render(state){
      resize();gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(sh.p);
      gl.uniformMatrix4fv(sh.projection,false,projection);gl.uniformMatrix4fv(sh.view,false,view);gl.uniform3fv(sh.camera,camera);drawCount=0;
      market(state.now);tracks(state.roadScroll);
      const items=state.objects.slice().sort((a,b)=>a.depth-b.depth);
      for(const item of items){const z=objectZ(item.depth),x=item.lane*LANE_GAP,s=.82+(item.depth/PLAYER_DEPTH)*.24;if(item.kind==="coin")coin(x,z,state.now,s);else if(item.kind==="spice")jar(x,z,item.spiceIndex,state.now,s);else if(item.kind.startsWith("boost-"))powerup(x,z,item.kind,state.now,s);else if(item.kind==="crate")crate(x,z,s);else if(item.kind==="barrier")barrier(x,z,s);else if(item.kind==="awning")awning(x,z,s);else if(item.kind==="train")train(x,z,s);}
      guard(state.lane,state.guard||state.chaser||0,state.now);
      runner(state.lane,state.jumpTime,state.slideTime,state.now,state.jumpHeight,state);
      return drawCount;
    }
    return {render,gl,dispose(){[cubeMesh,sphereMesh,cyl,taper,cone].forEach(m=>gl.deleteBuffer(m.buffer));gl.deleteProgram(sh.p);}};
  }
  window.ZaradSpiceWebGL={create(canvas){try{return create(canvas);}catch(e){console.error("[Zarad Spice Sprint] WebGL init failed",e);return null;}}};
})();