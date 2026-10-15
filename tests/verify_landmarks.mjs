import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {prepareBuildingTiles,buildBuildingTile} from '../dist/buildings3d.mjs';
import {applyOverride} from '../dist/survey-core.mjs';
const map=JSON.parse(fs.readFileSync(new URL('../dist/data/real-hachiman.json',import.meta.url))),by=new Map(map.buildings.map(b=>[b.id,b]));
assert.equal(map.landmarks.length,7);assert.equal(map.landmarks.filter(l=>l.kind==='junction').length,3);
for(const l of map.landmarks){assert(l.sources.length);assert(l.unverified.length);assert(l.camera);if(l.buildingId)assert(by.has(l.buildingId));assert(l.anchor.every(Number.isFinite))}
assert.equal(by.get('247999560').levels,5);assert.equal(by.get('247999559').levels,4);const white=by.get('386119860');assert.equal(white.levels,2);assert.equal(white.roofShape,'hipped');assert.equal(white.publishedOverallHeight,12.6);assert(!white.heightMeasured);assert(white.evidence.footprint.includes('unresolved'));
const mat=new THREE.MeshLambertMaterial({vertexColors:true}),box=new THREE.BoxGeometry(1,1,1),mats=Object.fromEntries(['frame','glass','door','balcony','canopy'].map(k=>[k,mat]));
const tile=prepareBuildingTiles([white])[0],mesh=buildBuildingTile(THREE,tile,mat,box,mats,map.renderRoute);for(const shell of [mesh.near,mesh.far]){const pos=shell.geometry.getAttribute('position').array;let top=0;for(let i=1;i<pos.length;i+=3)top=Math.max(top,pos[i]);assert(Math.abs(top-12.6)<1e-5,'Published overall height not reproduced by tower silhouette')}
assert(tile.height>=14.6,'Tower must be included in culling bounds');const edited=applyOverride(white,{height:9.2,features:white.features});assert.equal(edited.features[0].kind,'tower');assert.throws(()=>applyOverride(white,{features:[{...white.features[0],roofRise:'invalid'}]}));
const school=map.landmarks.find(l=>l.id==='school-front');assert(Math.hypot(map.route[0][0]-school.anchor[0],map.route[0][1]-school.anchor[1])<.01,'Starting school label must activate at start');
console.log('PASS: source-backed stations, pending junctions, published floors/overall height, near/far tower silhouette/culling, persistent tower editing, school start anchor.');
