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
