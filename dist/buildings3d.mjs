// Actual map footprints keep their orientation and courtyard holes at every LOD.
// Only heights, facade fittings and untagged roof/material choices are estimated.
export function prepareBuildingTiles(buildings, size=128) {
  const tiles=new Map();
  for(const building of buildings){
    const [x,z]=building.centroid,key=`${Math.floor(x/size)},${Math.floor(z/size)}`;
    if(!tiles.has(key))tiles.set(key,{key,buildings:[],bounds:[Infinity,Infinity,-Infinity,-Infinity],height:0});
    const tile=tiles.get(key);tile.buildings.push(building);tile.height=Math.max(tile.height,building.height+2);
    for(const p of building.p){tile.bounds[0]=Math.min(tile.bounds[0],p[0]);tile.bounds[1]=Math.min(tile.bounds[1],p[1]);tile.bounds[2]=Math.max(tile.bounds[2],p[0]);tile.bounds[3]=Math.max(tile.bounds[3],p[1])}
  }
  return [...tiles.values()];
}
const wallPalette=['#d8d1c1','#c8c5bb','#ddd9ce','#b4bdb8','#cebda5','#e0ded5','#b4aca0'];
const roofPalette=['#4c565a','#665750','#66706f','#424b52'];
function simplifyRing(points){
  return points.filter((b,i)=>{const a=points[(i-1+points.length)%points.length],c=points[(i+1)%points.length];return Math.abs((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))>.03});
}
function signedArea(points){return points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1]},0)/2}
export function buildBuildingTile(THREE,tile,sharedMaterial,boxGeometry,detailMaterials,route){
  const positions=[],colors=[],lowPositions=[],lowColors=[],detail=new Map();
  const color=new THREE.Color();
  function triangle(out,cs,a,b,c,shade){out.push(...a,...b,...c);color.set(shade);for(let i=0;i<3;i++)cs.push(color.r,color.g,color.b)}
  function triangleBoth(a,b,c,shade,totalHeight){triangle(positions,colors,a,b,c,shade);triangle(lowPositions,lowColors,...[a,b,c].map(p=>[p[0],p[1]>.1?totalHeight:p[1],p[2]]),shade)}
  function fitting(kind,x,y,z,w,h,d,rotation,tint=null){if(!detail.has(kind))detail.set(kind,[]);detail.get(kind).push({x,y,z,w,h,d,rotation,tint})}
  function routeDistance(p){let best=Infinity;for(let i=0;i<route.length;i+=4){const q=route[i];best=Math.min(best,Math.hypot(p[0]-q[0],p[1]-q[1]))}return best}
  for(const b of tile.buildings){
    const h=b.eaveHeight??b.height,pts=b.p;
    const wall=b.wallColor||({house:'#d8d1c1',apartments:'#ddd9ce',institution:'#e1ded5',commercial:'#c8c5bb',outbuilding:'#b4aca0','large-unknown':'#d3cec0'}[b.style]||wallPalette[0]);
    const roof=b.roofColor||(b.roofShape==='flat'?roofPalette[2]:roofPalette[0]);
    let front=null;
    for(const [ri,ring] of [pts,...b.holes].entries()){
      const orientation=Math.sign(signedArea(ring))||1;
      for(let i=0;i<ring.length;i++){
        const a=ring[i],q=ring[(i+1)%ring.length],dx=q[0]-a[0],dz=q[1]-a[1],length=Math.hypot(dx,dz);
        if(length<.02)continue;
        const baseA=[a[0],.06,a[1]],baseB=[q[0],.06,q[1]],topA=[a[0],h,a[1]],topB=[q[0],h,q[1]];
        triangleBoth(baseA,baseB,topA,wall,b.height);triangleBoth(baseB,topB,topA,wall,b.height);
        if(b.routeDistance>150||ri>0||length<3)continue;
        // Ring winding determines outward normal; this is independent of tile order.
        const nx=dz/length*orientation,nz=-dx/length*orientation,theta=-Math.atan2(dz,dx);
        const midpoint=[(a[0]+q[0])/2,(a[1]+q[1])/2],dist=routeDistance(midpoint);
        if(!front||i===b.frontEdge)front={midpoint,dist,nx,nz,theta,length};
        const cols=Math.min(b.style==='institution'?8:5,Math.max(1,Math.floor(length/3.0)));
        const rows=b.features?.some(f=>f.kind==='window')?0:b.style==='outbuilding'?0:Math.max(1,Math.min(8,b.levels??Math.floor((h-1)/2.8)));
        for(let row=0;row<rows;row++)for(let k=0;k<cols;k++){
          const f=(k+1)/(cols+1),x=a[0]+dx*f+nx*.075,z=a[1]+dz*f+nz*.075,y=1.7+row*2.8;
          if(y+.75>=h)continue;
          fitting('frame',x,y,z,b.type==='school'?2.15:1.20,1.32,.08,theta);fitting('glass',x+nx*.04,y,z+ nz*.04,b.type==='school'?1.96:1.0,1.10,.05,theta);
          if(b.style==='apartments'&&row>0&&dist>9)fitting('balcony',x+nx*.3,y-.8,z+nz*.3,1.55,.14,.55,theta);
        }
      }
    }
    if(front&&!b.features?.some(f=>f.kind==='door')&&b.style!=='outbuilding'&&b.siteUse!=='school'){
      const {midpoint:p,nx,nz,theta,length}=front;
      fitting('door',p[0]+nx*.06,1.12,p[1]+nz*.06,b.style==='institution'?1.8:1.05,2.12,.09,theta);
      // Deeper canopies/balconies are added only where there is facade clearance.
      if(front.dist>9&&length>5)fitting('canopy',p[0]+nx*.35,2.38,p[1]+nz*.35,1.75,.14,.7,theta);
    }
    for(const feature of b.features||[]){const kind={window:'glass',door:'door',sign:'canopy',fence:'frame',parking:'balcony',plant:'canopy'}[feature.kind];if(kind)fitting(kind,feature.x,feature.y,feature.z,feature.width,feature.height,feature.depth,-(feature.rotation||0)*Math.PI/180,feature.color||null)}
    const vectors=pts.map(p=>new THREE.Vector2(...p)),holes=b.holes.map(r=>r.map(p=>new THREE.Vector2(...p)));
    const flat=[...pts,...b.holes.flat()];
    for(const tri of THREE.ShapeUtils.triangulateShape(vectors,holes)){
      const [a,c,d]=tri.map(i=>[flat[i][0],h,flat[i][1]]);
      triangle(lowPositions,lowColors,...[a,c,d].map(p=>[p[0],b.height,p[2]]),roof);
    }
    const corners=simplifyRing(pts);
    const rectangular=corners.length===4&&!b.holes.length&&corners.every((p,i)=>{
      const a=corners[(i+3)%4],c=corners[(i+1)%4],dx=p[0]-a[0],dz=p[1]-a[1],ex=c[0]-p[0],ez=c[1]-p[1];return Math.abs((dx*ex+dz*ez)/(Math.hypot(dx,dz)*Math.hypot(ex,ez)))<.25;
    });
    if(rectangular&&['gabled','hipped','pyramidal'].includes(b.roofShape)){
      const side0=Math.hypot(corners[1][0]-corners[0][0],corners[1][1]-corners[0][1]);
      const side1=Math.hypot(corners[2][0]-corners[1][0],corners[2][1]-corners[1][1]);
      const shortSide=side0<side1?0:1,rise=b.roofRise??Math.min(1.8,Math.min(side0,side1)*.22);
      const middle=(i,j)=>[(corners[i][0]+corners[j][0])/2,h+rise,(corners[i][1]+corners[j][1])/2];
      let ridge=[middle(shortSide,(shortSide+1)%4),middle((shortSide+2)%4,(shortSide+3)%4)];
      if(b.roofShape==='pyramidal')ridge=[ridge[0].map((v,k)=>(v+ridge[1][k])/2),ridge[0].map((v,k)=>(v+ridge[1][k])/2)];
      else if(b.roofShape==='hipped'){const [a,c]=ridge;ridge=[a.map((v,k)=>v*.77+c[k]*.23),c.map((v,k)=>v*.77+a[k]*.23)]}
      for(let i=0;i<4;i++){
        const p=corners[i],q=corners[(i+1)%4],a=[p[0],h,p[1]],c=[q[0],h,q[1]];
        const near=Math.hypot(p[0]-ridge[0][0],p[1]-ridge[0][2])<Math.hypot(p[0]-ridge[1][0],p[1]-ridge[1][2])?0:1;
        const far=Math.hypot(q[0]-ridge[0][0],q[1]-ridge[0][2])<Math.hypot(q[0]-ridge[1][0],q[1]-ridge[1][2])?0:1;
        const gable=b.roofShape==='gabled'&&near===far;
        triangle(positions,colors,a,c,ridge[far],gable?wall:roof);
        if(near!==far)triangle(positions,colors,a,ridge[far],ridge[near],roof);
      }
    }else if(b.roofShape==='shed'){
      let longest=0,nx=1,nz=0;for(let i=0;i<pts.length;i++){const a=pts[i],q=pts[(i+1)%pts.length],length=Math.hypot(q[0]-a[0],q[1]-a[1]);if(length>longest){longest=length;nx=-(q[1]-a[1])/length;nz=(q[0]-a[0])/length}}const values=pts.map(p=>p[0]*nx+p[1]*nz),min=Math.min(...values),range=Math.max(...values)-min||1,elevate=p=>[p[0],h+(b.roofRise||0)*(p[0]*nx+p[1]*nz-min)/range,p[1]];
      for(const tri of THREE.ShapeUtils.triangulateShape(vectors,holes))triangle(positions,colors,...tri.map(i=>elevate(flat[i])),roof);
      for(const ring of [pts,...b.holes])for(let i=0;i<ring.length;i++){const a=ring[i],q=ring[(i+1)%ring.length];triangle(positions,colors,[a[0],h,a[1]],[q[0],h,q[1]],elevate(a),wall);triangle(positions,colors,[q[0],h,q[1]],elevate(q),elevate(a),wall)}
    }else if(b.roofShape==='gabled'){
      // Pitch complex real footprints without replacing them with rectangles.
      // Split each roof triangle at the ridge so concave outlines stay intact.
      let direction=[1,0],longest=0;
      for(let i=0;i<pts.length;i++){const a=pts[i],c=pts[(i+1)%pts.length],dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);if(length>longest){longest=length;direction=[dx/length,dz/length]}}
      const nx=-direction[1],nz=direction[0],project=p=>p[0]*nx+p[1]*nz;
      const values=pts.map(project),min=Math.min(...values),max=Math.max(...values),mid=(min+max)/2,half=(max-min)/2,rise=b.roofRise??Math.min(1.8,half*.44);
      const elevated=p=>[p[0],h+rise*Math.max(0,1-Math.abs(project(p)-mid)/(half||1)),p[1]];
      function cut(poly,side){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],c=poly[(i+1)%poly.length],u=project(a)-mid,v=project(c)-mid;if(u*side>=0)out.push(a);if((u<0&&v>0)||(u>0&&v<0)){const f=-u/(v-u);out.push([a[0]+(c[0]-a[0])*f,a[1]+(c[1]-a[1])*f])}}return out}
      for(const tri of THREE.ShapeUtils.triangulateShape(vectors,holes))for(const side of [-1,1]){
        const poly=cut(tri.map(i=>flat[i]),side);for(let i=1;i<poly.length-1;i++)triangle(positions,colors,elevated(poly[0]),elevated(poly[i]),elevated(poly[i+1]),roof);
      }
      for(const boundary of [pts,...b.holes])for(let i=0;i<boundary.length;i++){
        const a=boundary[i],c=boundary[(i+1)%boundary.length],u=project(a)-mid,v=project(c)-mid,edge=[a];
        if((u<0&&v>0)||(u>0&&v<0)){const f=-u/(v-u);edge.push([a[0]+(c[0]-a[0])*f,a[1]+(c[1]-a[1])*f])}edge.push(c);
        for(let j=0;j<edge.length-1;j++){const p=edge[j],q=edge[j+1],pa=[p[0],h,p[1]],qa=[q[0],h,q[1]],pt=elevated(p),qt=elevated(q);triangle(positions,colors,pa,qa,pt,wall);triangle(positions,colors,qa,qt,pt,wall)}
      }
    }else{
      for(const tri of THREE.ShapeUtils.triangulateShape(vectors,holes))triangle(positions,colors,...tri.map(i=>[flat[i][0],h,flat[i][1]]),roof);
    }
  }
  const group=new THREE.Group(),details=new THREE.Group();
  function mesh(p,c){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.computeVertexNormals();g.computeBoundingSphere();return new THREE.Mesh(g,sharedMaterial)}
  const near=mesh(positions,colors),far=mesh(lowPositions,lowColors);group.add(near,far,details);
  near.userData.buildingCount=far.userData.buildingCount=tile.buildings.length;
  for(const [kind,items] of detail){
    const m=new THREE.InstancedMesh(boxGeometry,detailMaterials[kind],items.length),o=new THREE.Object3D();
    items.forEach((d,i)=>{o.position.set(d.x,d.y,d.z);o.rotation.set(0,d.rotation,0);o.scale.set(d.w,d.h,d.d);o.updateMatrix();m.setMatrixAt(i,o.matrix);if(d.tint)m.setColorAt(i,new THREE.Color(d.tint))});
    m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();details.add(m);
  }
  for(const b of tile.buildings)for(const f of b.features||[])if(f.kind==='sign'&&f.text&&typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const context=canvas.getContext('2d');context.fillStyle=f.color||'#eeeeee';context.fillRect(0,0,512,128);context.fillStyle='#14212b';context.font='bold 48px sans-serif';context.textAlign='center';context.fillText(String(f.text).slice(0,60),256,82,480);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(f.width,f.height),material);mesh.position.set(f.x,f.y,f.z);mesh.rotation.y=-(f.rotation||0)*Math.PI/180;details.add(mesh)
  }
  return {group,near,far,details};
}
