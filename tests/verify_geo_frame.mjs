import assert from 'node:assert/strict';
import {createGeoFrame,rightSide} from '../dist/geo-frame.mjs';
import * as THREE from '../dist/vendor/three.module.js';
const frame=createGeoFrame(35.13838);
const camera=new THREE.PerspectiveCamera(74,1,.65,760);
camera.position.set(...frame.worldPoint(0,0,3));camera.lookAt(...frame.worldPoint(100,0,3));camera.updateMatrixWorld();
const north=new THREE.Vector3(...frame.worldPoint(20,10,3)).project(camera);
const south=new THREE.Vector3(...frame.worldPoint(20,-10,3)).project(camera);
assert.ok(north.x<0,'Facing east, actual north must appear on the left');
assert.ok(south.x>0,'Facing east, south must appear on the right');
assert.ok(rightSide(20,10,0)<0);
assert.ok(frame.eastScale>1&&frame.eastScale<1.002);
assert.ok(frame.northScale>.996&&frame.northScale<1);
const transform=new THREE.Matrix4().makeScale(frame.eastScale,1,-frame.northScale);
for(const point of [[0,0],[174,-62],[-998,442]]){
 const meshPosition=new THREE.Vector3(point[0],7,point[1]).applyMatrix4(transform);
 assert.ok(meshPosition.distanceTo(new THREE.Vector3(...frame.worldPoint(...point,7)))<1e-12);
}
console.log('PASS: east/north handedness, camera/mesh shared frame, WGS84 local scale.');
