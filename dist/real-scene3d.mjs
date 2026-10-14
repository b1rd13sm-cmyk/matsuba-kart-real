import * as THREE from './vendor/three.module.js';
import {createGeoFrame} from './geo-frame.mjs';
import {prepareBuildingTiles,buildBuildingTile} from './buildings3d.mjs';

// This scene uses only the OSM-derived, build-time data file. Game physics,
// standings, item timing and minimap remain in the original race engine.
const map=window.REAL_HACHIMAN, race=window.kartSceneData;
const frame=createGeoFrame(map.origin.lat);
if(!map||!race)throw new Error('REAL course data unavailable');
const canvas=document.createElement('canvas');
canvas.className='gamecanvas';canvas.style.zIndex='0';
document.body.insertBefore(canvas,document.querySelector('#canvas'));
try {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:!!window.KART_SURVEY});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#b8d6e6');
  scene.fog=new THREE.Fog('#c6d7d8',240,740);
  const world=new THREE.Group();world.scale.set(frame.eastScale,1,-frame.northScale);scene.add(world);
  const camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.65,760);
  const ambient=new THREE.HemisphereLight('#edf4fa','#a2a9af',1.5);world.add(ambient);
  const sun=new THREE.DirectionalLight('#ffffff',1.15);sun.position.set(-95,190,80);world.add(sun);
  const material=(color,roughness=1)=>new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide});
  const asphalt=material('#646966',.98),roadSecondary=material('#777b77',.98);
  const edge=material('#e4e4da'),center=material('#e9e8dc');
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(4300,3600),material('#8c9b77'));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.13;world.add(ground);

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
    const mesh=new THREE.Mesh(geo,mat);world.add(mesh);return mesh;
  }
  function polygon(points,y,mat,holes=[]){
    if(points.length<3)return;
    const contour=points.map(p=>new THREE.Vector2(...p)),inner=holes.map(r=>r.map(p=>new THREE.Vector2(...p)));
    const all=[...points,...holes.flat()],pos=[];
    for(const tri of THREE.ShapeUtils.triangulateShape(contour,inner))for(const i of tri)pos.push(all[i][0],y,all[i][1]);
    if(!pos.length)return;
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,mat);world.add(mesh);return mesh;
  }
  function surface(polygons,y,mat){
    const groups=new Map();
    for(const poly of polygons){
      const p=poly.p[0],key=`${Math.floor(p[0]/128)},${Math.floor(p[1]/128)}`;
      if(!groups.has(key))groups.set(key,[]);const pos=groups.get(key),all=[...poly.p,...poly.holes.flat()];
      for(const tri of THREE.ShapeUtils.triangulateShape(poly.p.map(p=>new THREE.Vector2(...p)),poly.holes.map(r=>r.map(p=>new THREE.Vector2(...p)))))for(const i of tri)pos.push(all[i][0],y,all[i][1]);
    }
    for(const pos of groups.values()){
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();world.add(new THREE.Mesh(geo,mat));
    }
  }
  const soil=material('#8f805c'),field=material('#9cae73'),grass=material('#849b69'),schoolLand=material('#a4a591');
  const residential=material('#a0a593'),water=material('#579aab',.3),parking=material('#898d86');
  for(const parcel of map.landuse){const m=parcel.type==='farmland'?soil:parcel.type==='residential'?residential:parcel.type==='water'?water:parcel.type==='parking'?parking:parcel.type==='meadow'||parcel.type==='grass'?field:grass;polygon(parcel.p,-.065,m,parcel.holes||[])}
  polygon(map.schoolGround,-.046,schoolLand);
  for(const stream of map.waterways)strip(stream.p,stream.type==='river'?6.2:2.4,-.038,water);
  // Roads yield to exact source footprints; buildings are never shifted away.
  surface(map.roadSurfaces.secondary,.012,roadSecondary);
  surface(map.roadSurfaces.sidewalk,.019,material('#bbbfb5'));
  surface(map.roadSurfaces.race,.034,asphalt);
  surface(map.roadSurfaces.edge,.064,edge);
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
  dashes.count=index;dashes.instanceMatrix.needsUpdate=true;world.add(dashes);

  // One colored solid mesh per 128 m tile at each shell LOD, shared materials.
  // No building count limit. Geometry is built lazily and retained for revisits.
  const shellMaterial=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  const sharedBox=new THREE.BoxGeometry(1,1,1);
  const detailMaterials={frame:material('#dfe3e5'),glass:material('#526c76'),door:material('#596165'),balcony:material('#a4a89e'),canopy:material('#737c78')};
  const buildingTiles=prepareBuildingTiles(map.buildings);
  for(const tile of buildingTiles){const [x0,z0,x1,z1]=tile.bounds;
    tile.sphere=new THREE.Sphere(new THREE.Vector3(...frame.worldPoint((x0+x1)/2,(z0+z1)/2,tile.height/2)),Math.hypot((x1-x0)*frame.eastScale/2,(z1-z0)*frame.northScale/2,tile.height/2));
  }
  const frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  const stats={totalBuildings:map.buildings.length,loadedTiles:0,visibleBuildings:0,visibleTiles:0,detailTiles:0,calls:0,triangles:0,frameMs:0};
  window.kartSceneStats=stats;
  function updateBuildings(){
    camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
    stats.visibleBuildings=stats.visibleTiles=stats.detailTiles=0;
    const pending=[];
    for(const tile of buildingTiles){
      const distance=camera.position.distanceTo(tile.sphere.center)-tile.sphere.radius;
      const visible=distance<760&&frustum.intersectsSphere(tile.sphere);
      if(!tile.meshes){if(distance<820)pending.push({tile,distance});continue}
      const {group,near,far,details}=tile.meshes;group.visible=visible;
      if(!visible)continue;
      near.visible=distance<260;far.visible=!near.visible;details.visible=distance<110;
      stats.visibleBuildings+=tile.buildings.length;stats.visibleTiles++;if(details.visible)stats.detailTiles++;
    }
    // At most two tiles per frame; prioritize immediate facades, not far scenery.
    pending.sort((a,b)=>a.distance-b.distance);
    for(const {tile} of pending.slice(0,2)){
      tile.meshes=buildBuildingTile(THREE,tile,shellMaterial,sharedBox,detailMaterials,map.renderRoute);
      tile.meshes.group.visible=false;world.add(tile.meshes.group);stats.loadedTiles++;
    }
  }
  const namedBuildings=map.buildings.filter(b=>b.name&&b.routeDistance<100);
  let nextLabel=0;
  function updatePlaceLabel(me){if(performance.now()<nextLabel)return;nextLabel=performance.now()+300;let closest=null,distance=60;for(const b of namedBuildings){let d=Infinity;for(let i=0;i<b.p.length;i++){const a=b.p[i],q=b.p[(i+1)%b.p.length],dx=q[0]-a[0],dy=q[1]-a[1],u=Math.max(0,Math.min(1,((me.x-a[0])*dx+(me.y-a[1])*dy)/(dx*dx+dy*dy||1)));d=Math.min(d,Math.hypot(me.x-a[0]-dx*u,me.y-a[1]-dy*u))}if(d<distance){distance=d;closest=b}}document.querySelector('#district').textContent='八幡学区 REAL'+(closest?' · '+closest.name.replace('近江八幡市立',''):'')}
  function raceDistance(p){let best=Infinity;for(let i=0;i<map.route.length;i+=4){const q=map.route[i];best=Math.min(best,Math.hypot(p[0]-q[0],p[1]-q[1]))}return best}
  function placement(out,x,y,z,wide,high,deep,rotation){out.push({x,y,z,wide,high,deep,rotation})}
  function instances(items,mat){if(!items.length)return;
    const mesh=new THREE.InstancedMesh(sharedBox,mat,items.length),o=new THREE.Object3D();
    items.forEach((d,i)=>{o.position.set(d.x,d.y,d.z);o.rotation.set(0,d.rotation,0);o.scale.set(d.wide,d.high,d.deep);o.updateMatrix();mesh.setMatrixAt(i,o.matrix)});
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();world.add(mesh);
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
  poles.instanceMatrix.needsUpdate=true;world.add(poles);
  const wireVertices=[];
  for(let i=1;i<polePositions.length;i++){
    const a=polePositions[i-1],b=polePositions[i];if(Math.hypot(a[0]-b[0],a[1]-b[1])>70)continue;
    for(const h of [8.3,8.65]){
      const m=[(a[0]+b[0])/2,h-.35,(a[1]+b[1])/2];wireVertices.push(a[0],h,a[1],...m,...m,b[0],h,b[1]);
    }
  }
  const wireGeometry=new THREE.BufferGeometry();wireGeometry.setAttribute('position',new THREE.Float32BufferAttribute(wireVertices,3));world.add(new THREE.LineSegments(wireGeometry,wireMat));


  const checkColors=[material('#f5f5ed'),material('#28343c'),material('#f4da50'),material('#e75684')];
  const checks=[[],[],[],[]];
  for(const f of [0,.25,.75]){
    const t=race.base(f),ahead=race.base(f+.0001),h=Math.atan2(ahead.y-t.y,ahead.x-t.x);
    for(let row=0;row<2;row++)for(let col=0;col<12;col++){
      const along=(row-.5)*.49,across=-4.4+(col+.5)*8.8/12;
      checks[(f===0?0:2)+(row+col)%2].push({x:t.x+Math.cos(h)*along-Math.sin(h)*across,z:t.y+Math.sin(h)*along+Math.cos(h)*across,h});
    }
  }
  const checkGeometry=new THREE.PlaneGeometry(.48,8.8/12),checkObj=new THREE.Object3D();
  checks.forEach((list,i)=>{const mesh=new THREE.InstancedMesh(checkGeometry,checkColors[i],list.length);list.forEach((p,j)=>{checkObj.position.set(p.x,.09,p.z);checkObj.rotation.set(-Math.PI/2,0,-p.h);checkObj.updateMatrix();mesh.setMatrixAt(j,checkObj.matrix)});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();world.add(mesh)});

  // Eight karts share four draw calls; their colors are instance attributes.
  const kartParts=[
    {g:new THREE.BoxGeometry(1.55,.55,2.1),mat:material('#ffffff'),offsets:[[0,.55,0]],colored:true},
    {g:new THREE.BoxGeometry(1.12,.5,.91),mat:material('#83adbb'),offsets:[[0,1.04,-.13]]},
    {g:new THREE.BoxGeometry(.31,.48,.56),mat:material('#242a2d'),offsets:[[-.93,.33,-.73],[-.93,.33,.73],[.93,.33,-.73],[.93,.33,.73]]},
    {g:new THREE.BoxGeometry(1.8,.13,.37),mat:material('#28333c'),offsets:[[0,1.2,-.96]]}
  ];
  for(const part of kartParts){part.mesh=new THREE.InstancedMesh(part.g,part.mat,(race.bots.length+1)*part.offsets.length);part.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);part.mesh.frustumCulled=false;world.add(part.mesh)}
  const kartTransform=new THREE.Object3D(),kartColor=new THREE.Color();
  function updateKarts(me){const cars=[me,...race.bots];
    for(const part of kartParts){let index=0;
      for(const car of cars){const rotation=-car.h+Math.PI/2,c=Math.cos(rotation),s=Math.sin(rotation);
        for(const [x,y,z] of part.offsets){kartTransform.position.set(car.x+x*c+z*s,y+.08,car.y-x*s+z*c);kartTransform.rotation.set(0,rotation,0);kartTransform.updateMatrix();part.mesh.setMatrixAt(index,kartTransform.matrix);if(part.colored)part.mesh.setColorAt(index,kartColor.set(car.color));index++}
      }part.mesh.instanceMatrix.needsUpdate=true;if(part.colored)part.mesh.instanceColor.needsUpdate=true;
    }
  }
  function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
  addEventListener('resize',resize);resize();
  let surveyCamera=null;
  if(window.KART_SURVEY)window.kartSurveyScene={
    camera(value){surveyCamera=value;return surveyCamera},
    capture(){renderer.render(scene,camera);return canvas.toDataURL('image/png')},
    refresh(){for(const tile of buildingTiles){if(tile.meshes){world.remove(tile.meshes.group);tile.meshes.group.traverse(o=>{if(o.geometry&&o.geometry!==sharedBox)o.geometry.dispose();if(o.material?.map){o.material.map.dispose();o.material.dispose()}})}}buildingTiles.splice(0,buildingTiles.length,...prepareBuildingTiles(map.buildings));for(const tile of buildingTiles){const [x0,z0,x1,z1]=tile.bounds;tile.sphere=new THREE.Sphere(new THREE.Vector3(...frame.worldPoint((x0+x1)/2,(z0+z1)/2,tile.height/2)),Math.hypot((x1-x0)*frame.eastScale/2,(z1-z0)*frame.northScale/2,tile.height/2))}stats.loadedTiles=0},
    groundPoint(clientX,clientY){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(clientX/innerWidth*2-1,1-clientY/innerHeight*2),camera);const point=new THREE.Vector3();if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),point))return null;return [point.x/frame.eastScale,-point.z/frame.northScale]}
  };
  window.renderKartScene=(me)=>{
    const fx=Math.cos(me.camera),fz=Math.sin(me.camera);
    camera.position.set(...frame.worldPoint(me.x-fx*5.5,me.y-fz*5.5,3.65));camera.lookAt(...frame.worldPoint(me.x+fx*22,me.y+fz*22,1.4));
    if(surveyCamera){const c=surveyCamera,h=c.heading*Math.PI/180,p=c.pitch*Math.PI/180;camera.position.set(...frame.worldPoint(c.x,c.y,c.height));camera.lookAt(...frame.worldPoint(c.x+Math.sin(h)*Math.cos(p)*100,c.y+Math.cos(h)*Math.cos(p)*100,c.height+Math.sin(p)*100));camera.fov=c.fov;camera.updateProjectionMatrix()}else if(camera.fov!==74){camera.fov=74;camera.updateProjectionMatrix()}
    updateKarts(me);updatePlaceLabel(me);
    const started=performance.now();updateBuildings();renderer.render(scene,camera);stats.calls=renderer.info.render.calls;stats.triangles=renderer.info.render.triangles;stats.frameMs=performance.now()-started;
  };
} catch(error){console.warn('REAL 3D unavailable; using the 2D course renderer.',error);canvas.remove()}
