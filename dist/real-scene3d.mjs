import * as THREE from './vendor/three.module.js';

// This scene uses only the OSM-derived, build-time data file. Game physics,
// standings, item timing and minimap remain in the original race engine.
const map=window.REAL_HACHIMAN, race=window.kartSceneData;
const canvas=document.createElement('canvas');
canvas.className='gamecanvas';canvas.style.zIndex='0';
document.body.insertBefore(canvas,document.querySelector('#canvas'));
try {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.32;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#b8d6e6');
  scene.fog=new THREE.Fog('#c6d7d8',125,440);
  const camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.65,455);
  const ambient=new THREE.HemisphereLight('#e8f3ff','#938f7e',2.1);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#ffeed2',2.2);sun.position.set(-95,190,80);scene.add(sun);
  const material=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness,side:THREE.DoubleSide});
  const asphalt=material('#646966',.98),roadSecondary=material('#777b77',.98);
  const edge=material('#e4e4da'),center=material('#e9e8dc');
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(4300,3600),material('#8c9b77'));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.13;scene.add(ground);

  function strip(points,width,y,mat,closed=false){
    const vertices=[],uv=[],indices=[];let along=0;
    for(let i=0;i<points.length;i++){
      const p=points[i],prev=points[i?i-1:(closed?points.length-2:0)],next=points[i+1<points.length?i+1:(closed?1:i)];
      if(i)along+=Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]);
      const dx=next[0]-prev[0],dz=next[1]-prev[1],length=Math.hypot(dx,dz)||1,nx=-dz/length,nz=dx/length;
      vertices.push(p[0]+nx*width/2,y,p[1]+nz*width/2,p[0]-nx*width/2,y,p[1]-nz*width/2);
      uv.push(0,along/6,1,along/6);
      if(i){const a=(i-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,mat);scene.add(mesh);return mesh;
  }
  function polygon(points,y,mat){
    if(points.length<3)return;
    const vertices=points.map(p=>new THREE.Vector2(p[0],p[1]));
    const tris=THREE.ShapeUtils.triangulateShape(vertices,[]);if(!tris.length)return;
    const geo=new THREE.BufferGeometry(),pos=[];
    for(const tri of tris)for(const i of tri)pos.push(points[i][0],y,points[i][1]);
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo,mat));
  }
  const soil=material('#8f805c'),field=material('#9cae73'),grass=material('#849b69'),schoolLand=material('#a4a591');
  const residential=material('#a0a593'),water=material('#579aab',.3),parking=material('#898d86');
  for(const parcel of map.landuse){const m=parcel.type==='farmland'?soil:parcel.type==='residential'?residential:parcel.type==='water'?water:parcel.type==='parking'?parking:parcel.type==='meadow'||parcel.type==='grass'?field:grass;polygon(parcel.p,-.065,m)}
  polygon(map.schoolGround,-.046,schoolLand);
  for(const stream of map.waterways)strip(stream.p,stream.type==='river'?6.2:2.4,-.038,water);
  // Every visible side road follows its own OSM centreline and tagged width.
  for(const road of map.roads)strip(road.p,road.width,.012,roadSecondary);
  const joints=new THREE.InstancedMesh(new THREE.CircleGeometry(5.4,14),roadSecondary,map.junctions.length),jointObj=new THREE.Object3D();
  for(let i=0;i<map.junctions.length;i++){const p=map.junctions[i];jointObj.position.set(p[0],.018,p[1]);jointObj.rotation.set(-Math.PI/2,0,0);jointObj.updateMatrix();joints.setMatrixAt(i,jointObj.matrix)}
  joints.instanceMatrix.needsUpdate=true;scene.add(joints);
  const roadPath=[...map.route,map.route[0]];
  strip(roadPath,8.8,.034,asphalt,true);
  // Narrow raised curbs, thin painted shoulders, and separated centre dashes.
  const curbs=material('#aeb4ae'),pavement=material('#c0c3ba');
  for(const side of [-1,1]){
    const displaced=[];
    for(let i=0;i<map.route.length;i++){
      const prev=map.route[(i-1+map.route.length)%map.route.length],next=map.route[(i+1)%map.route.length],p=map.route[i],dx=next[0]-prev[0],dz=next[1]-prev[1],l=Math.hypot(dx,dz)||1;
      displaced.push([p[0]-dz/l*side*4.46,p[1]+dx/l*side*4.46]);
    }
    const loop=[...displaced,displaced[0]];
    strip(loop,.21,.058,curbs,true);
    const marking=loop.map((p,i)=>{const q=map.route[i%map.route.length];return [q[0]+(p[0]-q[0])*.92,q[1]+(p[1]-q[1])*.92]});
    strip(marking,.095,.064,edge,true);
    // Sidewalk ribbon is on the map-centred course's outside, not a ground decal.
    const outer=loop.map((p,i)=>{const q=map.route[i%map.route.length];return [q[0]+(p[0]-q[0])*1.19,q[1]+(p[1]-q[1])*1.19]});
    strip(outer,1.15,.003,pavement,true);
  }
  const dashTransform=new THREE.Object3D(),dashCount=Math.floor(map.routeLengthMeters/17);
  const dashes=new THREE.InstancedMesh(new THREE.PlaneGeometry(3.0,.14),center,dashCount);
  let sum=0,nextDash=8.5,index=0;
  for(let i=0;i<map.route.length&&index<dashCount;i++){
    const p=map.route[i],q=map.route[(i+1)%map.route.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz)||1;
    while(nextDash<sum+len&&index<dashCount){const f=(nextDash-sum)/len;
      dashTransform.position.set(p[0]+dx*f,.071,p[1]+dz*f);
      dashTransform.rotation.set(-Math.PI/2,0,-Math.atan2(dz,dx));dashTransform.updateMatrix();
      dashes.setMatrixAt(index++,dashTransform.matrix);nextDash+=17;
    }sum+=len;
  }
  dashes.count=index;dashes.instanceMatrix.needsUpdate=true;scene.add(dashes);

  // Separate tiled meshes group real building footprints, walls, and roofs.
  // Tiles outside the camera frustum are culled by Three.js, with farther
  // footprints lacking small facade fittings (geometry LOD).
  const palette=['#d8d3c6','#c8c4b9','#e1ded4','#aeb7b1','#d3c4b1'];
  const walls=palette.map(c=>material(c,.86));
  const roofs=[material('#4a5357',.9),material('#61534d',.9),material('#697171',.88)];
  const tiles=new Map(),foundation=material('#8f918c');
  function tileFor(p){const key=`${Math.floor(p[0]/120)},${Math.floor(p[1]/120)}`;
    if(!tiles.has(key))tiles.set(key,{wall:Array.from({length:walls.length},()=>[]),roof:Array.from({length:roofs.length},()=>[]),base:[]});
    return tiles.get(key)}
  function triangle(out,a,b,c){out.push(...a,...b,...c)}
  const detailFrames=[],detailGlass=[],detailDoors=[],detailBalconies=[],detailAC=[],namedBuildings=[];
  function placement(out,x,y,z,wide,high,deep,rotation){out.push({x,y,z,wide,high,deep,rotation})}
  for(const b of map.buildings){
    const pts=b.p;if(pts.length<3)continue;const height=b.height,kind=b.type;
    const shade=kind==='school'?3:kind==='retail'||kind==='commercial'?4:Number(b.id)%palette.length;
    const roofShade=Number(b.id)%roofs.length;
    const cell=tileFor(pts[0]),wallTris=cell.wall[shade],roofTris=cell.roof[roofShade];
    let dist=Infinity;for(const p of pts)dist=Math.min(dist,raceDistance(p));
    if(b.name&&dist<55&&['ローソン','白雲館','ガスト','滋賀銀行','近江兄弟社','千成亭','長五郎せんべい','八幡コミュニティセンター事務所棟'].includes(b.name))namedBuildings.push(b);
    for(let i=0;i<pts.length;i++){
      const a=pts[i],d=pts[(i+1)%pts.length],length=Math.hypot(d[0]-a[0],d[1]-a[1]);
      if(length<.3)continue;
      const foot=[a[0],-.13,a[1]],footQ=[d[0],-.13,d[1]],p=[a[0],.18,a[1]],q=[d[0],.18,d[1]],topP=[a[0],height,a[1]],topQ=[d[0],height,d[1]];
      triangle(cell.base,foot,footQ,p);triangle(cell.base,footQ,q,p);
      triangle(wallTris,p,q,topP);triangle(wallTris,q,topQ,topP);
      if(dist>64||length<5)continue;
      const ux=(d[0]-a[0])/length,uz=(d[1]-a[1])/length,theta=-Math.atan2(uz,ux),count=Math.min(5,Math.floor(length/3.5));
      for(let floor=0;floor<Math.max(1,Math.floor((height-2)/3));floor++)for(let k=0;k<count;k++){
        const x=a[0]+ux*length*(k+1)/(count+1),z=a[1]+uz*length*(k+1)/(count+1),y=1.9+floor*2.8;
        if(y+1.4>=height)continue;
        placement(detailFrames,x,y,z,1.28,1.44,.11,theta);
        placement(detailGlass,x,y,z,1.04,1.19,.15,theta);
        if(floor===1&&k===0&&Number(b.id)%4===0)placement(detailBalconies,x,y-.85,z,1.8,.16,.68,theta);
      }
      if(i===0&&length>5){const x=(a[0]+d[0])/2,z=(a[1]+d[1])/2;placement(detailDoors,x,1.1,z,1.14,2.16,.13,theta);
        if(Number(b.id)%3===0)placement(detailAC,x+ux*2,.46,z+uz*2,.8,.55,.53,theta)}
    }
    const gable=pts.length===4&&kind!=='school'&&kind!=='retail'&&kind!=='commercial';
    if(gable){
      const side0=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);
      const side1=Math.hypot(pts[1][0]-pts[2][0],pts[1][1]-pts[2][1]);
      const shortSide=side0<side1?0:1;
      const midpoint=(i,j)=>[(pts[i][0]+pts[j][0])/2,height+1.05,(pts[i][1]+pts[j][1])/2];
      const ridge=[midpoint(shortSide,(shortSide+1)%4),midpoint((shortSide+2)%4,(shortSide+3)%4)];
      for(let i=0;i<4;i++){
        const p=pts[i],q=pts[(i+1)%4],a=[p[0],height+.1,p[1]],c=[q[0],height+.1,q[1]];
        const near=mathDistance(p,ridge[0])<mathDistance(p,ridge[1])?0:1;
        const far=mathDistance(q,ridge[0])<mathDistance(q,ridge[1])?0:1;
        triangle(roofTris,a,c,ridge[far]);if(near!==far)triangle(roofTris,a,ridge[far],ridge[near]);
      }
    }else{
      const vectors=pts.map(p=>new THREE.Vector2(p[0],p[1]));
      for(const tri of THREE.ShapeUtils.triangulateShape(vectors,[])){
        triangle(roofTris,[pts[tri[0]][0],height+.10,pts[tri[0]][1]],
          [pts[tri[1]][0],height+.10,pts[tri[1]][1]],[pts[tri[2]][0],height+.10,pts[tri[2]][1]]);
      }
    }
  }
  function mathDistance(p,q){return Math.hypot(p[0]-q[0],p[1]-q[2])}
  function raceDistance(p){let best=Infinity;for(let i=0;i<map.route.length;i+=4){const q=map.route[i],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<best)best=d}return best}
  for(const t of tiles.values())for(const [groups,mats] of [[t.wall,walls],[t.roof,roofs]])groups.forEach((array,i)=>{
    if(!array.length)return;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(array,3));geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo,mats[i]));
  });
  for(const t of tiles.values())if(t.base.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(t.base,3));geo.computeVertexNormals();scene.add(new THREE.Mesh(geo,foundation))}
  function instances(instances,mat){if(!instances.length)return;
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,instances.length),o=new THREE.Object3D();
    instances.forEach((d,i)=>{o.position.set(d.x,d.y,d.z);o.rotation.set(0,d.rotation,0);o.scale.set(d.wide,d.high,d.deep);o.updateMatrix();mesh.setMatrixAt(i,o.matrix)});
    mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);
  }
  instances(detailFrames,material('#e6e2d7'));
  instances(detailGlass,material('#526e79',.37));
  instances(detailDoors,material('#75695b'));
  instances(detailBalconies,material('#9b9c98'));
  instances(detailAC,material('#9ba49f'));
  const parked=[];
  for(const lot of map.landuse.filter(p=>p.type==='parking')){
    if(lot.p.length<3)continue;const x=lot.p.reduce((s,p)=>s+p[0],0)/lot.p.length,z=lot.p.reduce((s,p)=>s+p[1],0)/lot.p.length;
    if(raceDistance([x,z])<80&&Number(lot.id)%3===0)placement(parked,x,.62,z,1.6,1.1,3.1,Number(lot.id)%6*.15);
  }
  instances(parked,material('#aeb4b2',.54));
  for(const b of namedBuildings){
    let best=null;
    for(let i=0;i<b.p.length;i++){const a=b.p[i],d=b.p[(i+1)%b.p.length],p=[(a[0]+d[0])/2,(a[1]+d[1])/2],n=raceDistance(p);
      if(!best||n<best.distance)best={p,angle:-Math.atan2(d[1]-a[1],d[0]-a[0]),distance:n}}
    const c=document.createElement('canvas');c.width=768;c.height=150;const x=c.getContext('2d');
    x.fillStyle=b.name==='ローソン'?'#1756a3':'#f1ebd9';x.fillRect(0,0,768,150);
    x.fillStyle=b.name==='ローソン'?'#fff':'#3d4443';x.font='bold 85px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(b.name,384,75,736);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(9,Math.max(4,b.name.length*.9)),1.2),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    m.position.set(best.p[0],Math.min(b.height-1.2,3.5),best.p[1]);m.rotation.y=best.angle;scene.add(m);
  }

  // School grounds are sourced from OSM. The fence and its sign are illustrative.
  const fencePost=[],fenceRail=[];
  for(let i=0;i<map.schoolGround.length;i++){
    const a=map.schoolGround[i],b=map.schoolGround[(i+1)%map.schoolGround.length],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(d<1||d>220)continue;
    const n=Math.ceil(d/4),angle=-Math.atan2(b[1]-a[1],b[0]-a[0]);
    for(let j=0;j<=n;j++){const f=j/n;placement(fencePost,a[0]+(b[0]-a[0])*f,1,a[1]+(b[1]-a[1])*f,.07,2,.07,angle)}
    placement(fenceRail,(a[0]+b[0])/2,1.7,(a[1]+b[1])/2,d,.055,.08,angle);
    placement(fenceRail,(a[0]+b[0])/2,.55,(a[1]+b[1])/2,d,.055,.08,angle);
  }
  instances(fencePost,material('#6f7e7b'));instances(fenceRail,material('#6f7e7b'));
  const signCanvas=document.createElement('canvas');signCanvas.width=1024;signCanvas.height=160;
  const cx=signCanvas.getContext('2d');cx.fillStyle='#e8e4d9';cx.fillRect(0,0,1024,160);
  cx.fillStyle='#263940';cx.font='bold 100px sans-serif';cx.textAlign='center';cx.fillText('近江八幡市立八幡中学校',512,110);
  const signTex=new THREE.CanvasTexture(signCanvas);signTex.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(12,1.9),new THREE.MeshBasicMaterial({map:signTex,side:THREE.DoubleSide}));
  const entrance=map.schoolGround.reduce((best,p)=>raceDistance(p)<raceDistance(best)?p:best,map.schoolGround[0]||[0,0]);
  const closest=race.track.reduce((best,p)=>Math.hypot(p.x-entrance[0],p.y-entrance[1])<Math.hypot(best.x-entrance[0],best.y-entrance[1])?p:best,race.track[0]);
  sign.position.set(entrance[0],2.3,entrance[1]);sign.rotation.y=-Math.atan2(closest.ty,closest.tx);scene.add(sign);

  // Local wires span consecutive poles only. There are no connections across
  // unrelated road sections, which previously caused long diagonal sky lines.
  const poleMat=material('#737b7a'),wireMat=new THREE.LineBasicMaterial({color:'#52595a',transparent:true,opacity:.65});
  const polePositions=[];let nextPole=32,travel=0;
  for(let i=0;i<map.route.length;i++){
    const a=map.route[i],b=map.route[(i+1)%map.route.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;
    while(travel+len>=nextPole){const f=(nextPole-travel)/len,nx=-dz/len,nz=dx/len;
      polePositions.push([a[0]+dx*f+nx*7.4,a[1]+dz*f+nz*7.4]);nextPole+=56}
    travel+=len;
  }
  const poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.11,.16,9.2,6),poleMat,polePositions.length),poleObj=new THREE.Object3D();
  polePositions.forEach((p,i)=>{poleObj.position.set(p[0],4.6,p[1]);poleObj.rotation.set(0,0,0);poleObj.scale.set(1,1,1);poleObj.updateMatrix();poles.setMatrixAt(i,poleObj.matrix)});
  poles.instanceMatrix.needsUpdate=true;scene.add(poles);
  for(let i=1;i<polePositions.length;i++){
    const a=polePositions[i-1],b=polePositions[i];if(Math.hypot(a[0]-b[0],a[1]-b[1])>70)continue;
    for(const h of [8.3,8.65]){
      const pts=[new THREE.Vector3(a[0],h,a[1]),new THREE.Vector3((a[0]+b[0])/2,h-.35,(a[1]+b[1])/2),new THREE.Vector3(b[0],h,b[1])];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),wireMat));
    }
  }

  const checkWhite=material('#f5f5ed'),checkBlack=material('#28343c');
  function checkpoint(f,matA,matB){const t=race.base(f),ahead=race.base(f+.0001),h=Math.atan2(ahead.y-t.y,ahead.x-t.x);
    const group=new THREE.Group();group.position.set(t.x,.09,t.y);group.rotation.y=-h;
    for(let row=0;row<2;row++)for(let col=0;col<12;col++){
      const m=new THREE.Mesh(new THREE.PlaneGeometry(.48,8.8/12),(row+col)%2?matA:matB);
      m.rotation.x=-Math.PI/2;m.position.set((row-.5)*.49,0,-4.4+(col+.5)*8.8/12);group.add(m)}scene.add(group)}
  checkpoint(0,checkWhite,checkBlack);
  checkpoint(.25,material('#f4da50'),material('#e75684'));
  checkpoint(.75,material('#f4da50'),material('#e75684'));

  const kartBody=new THREE.BoxGeometry(1.55,.55,2.1),wheel=new THREE.BoxGeometry(.31,.48,.56);
  const wheelMat=material('#242a2d'),glass=material('#83adbb',.4),trim=material('#28333c');
  function kart(color){const g=new THREE.Group(),body=new THREE.Mesh(kartBody,material(color,.4));body.position.y=.55;g.add(body);
    const cockpit=new THREE.Mesh(new THREE.BoxGeometry(1.12,.5,.91),glass);cockpit.position.set(0,1.04,-.13);g.add(cockpit);
    for(const x of [-.93,.93])for(const z of [-.73,.73]){const m=new THREE.Mesh(wheel,wheelMat);m.position.set(x,.33,z);g.add(m)}
    const wing=new THREE.Mesh(new THREE.BoxGeometry(1.8,.13,.37),trim);wing.position.set(0,1.2,-.96);g.add(wing);scene.add(g);return g}
  const player=kart('#00cce8'),rivals=race.bots.map(b=>({b,g:kart(b.color)}));
  function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
  addEventListener('resize',resize);resize();
  window.renderKartScene=(me)=>{
    const fx=Math.cos(me.camera),fz=Math.sin(me.camera);
    camera.position.set(me.x-fx*5.5,3.65,me.y-fz*5.5);camera.lookAt(me.x+fx*22,1.4,me.y+fz*22);
    player.position.set(me.x,.08,me.y);player.rotation.y=-me.h+Math.PI/2;
    for(const {b,g} of rivals){g.position.set(b.x,.08,b.y);g.rotation.y=-b.h+Math.PI/2}
    renderer.render(scene,camera);
  };
} catch(error){console.warn('REAL 3D unavailable; using the 2D course renderer.',error);canvas.remove()}
