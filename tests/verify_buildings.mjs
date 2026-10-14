import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {prepareBuildingTiles,buildBuildingTile} from '../dist/buildings3d.mjs';
const map=JSON.parse(fs.readFileSync(new URL('../dist/data/real-hachiman.json',import.meta.url),'utf8'));
const tiles=prepareBuildingTiles(map.buildings),mat=new THREE.MeshLambertMaterial({vertexColors:true}),box=new THREE.BoxGeometry(1,1,1);
const materials=Object.fromEntries(['frame','glass','door','balcony','canopy'].map(k=>[k,new THREE.MeshLambertMaterial()]));
let total=0,detailInstances=0,triangles=0;
for(const tile of tiles){
 const result=buildBuildingTile(THREE,tile,mat,box,materials,map.renderRoute);
 assert.equal(result.near.userData.buildingCount,tile.buildings.length);
 assert.equal(result.far.userData.buildingCount,tile.buildings.length);
 for(const mesh of [result.near,result.far]){
  const p=mesh.geometry.getAttribute('position');assert.ok([...p.array].every(Number.isFinite));assert.ok(p.count>=tile.buildings.length*12);
  assert.ok(mesh.geometry.boundingSphere.radius>0);triangles+=p.count/3;
 }
 for(const mesh of result.details.children){assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));detailInstances+=mesh.count}
 total+=tile.buildings.length;
 result.group.traverse(o=>{if(o.geometry&&!o.isInstancedMesh)o.geometry.dispose()});
}
assert.equal(total,map.buildings.length);
console.log(JSON.stringify({buildingsWithSolidNearAndFarGeometry:total,tiles:tiles.length,detailInstances,triangles}));
// Explicit colors must survive both shell LODs; unknown exteriors share the
// neutral fallback with Canvas and the survey color pickers.
const explicit={id:'color-regression',style:'house',wallColor:'#dd3322',roofColor:'#2266dd',p:[[0,0],[10,0],[10,10],[0,10]],holes:[],centroid:[5,5],height:6,eaveHeight:6,roofRise:0,roofShape:'flat',routeDistance:200};
const sample=buildBuildingTile(THREE,prepareBuildingTiles([explicit])[0],mat,box,materials,map.renderRoute);
for(const mesh of [sample.near,sample.far])for(const hex of [explicit.wallColor,explicit.roofColor]){
 const expected=new THREE.Color(hex),cs=mesh.geometry.getAttribute('color').array;let found=false;
 for(let i=0;i<cs.length;i+=3)if(Math.abs(cs[i]-expected.r)<1e-6&&Math.abs(cs[i+1]-expected.g)<1e-6&&Math.abs(cs[i+2]-expected.b)<1e-6){found=true;break}
 assert.ok(found,'Mapped wall/roof color lost at shell LOD');
}
assert.equal(globalThis.KART_BUILDING_COLORS.resolve({style:'house'}).wall,'#eceeeb');
assert.equal(globalThis.KART_BUILDING_COLORS.resolve({style:'commercial'}).wall,'#d7dcdf');
for(const b of map.buildings){const c=globalThis.KART_BUILDING_COLORS.resolve(b);if(b.wallColor)assert.equal(c.wall,b.wallColor);if(b.roofColor)assert.equal(c.roof,b.roofColor)}
console.log('PASS: neutral unknown defaults; explicit colors preserved for all buildings and both shell LODs.');
