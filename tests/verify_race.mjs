// Execute the actual race script in a controlled clock/DOM. Hooks exist only here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const map=JSON.parse(fs.readFileSync(new URL('../dist/data/real-hachiman.json',import.meta.url),'utf8'));
let script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
script=script.replace(/\}\)\(\);\s*$/,`window.testRace={me,bots,keys,start:()=>startRace(),update,reset:()=>reset(),base,nearest,boundaryLimit,setItem,useItem,phase:()=>phase,getBoost:()=>boostUntil,getPools:()=>puddles};})();`);
let clock=100000;
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{style:{},hidden:false,textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},children:[],addEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:190,height:190}},getContext(){return{setTransform(){}}},getAttribute(){return null}});return elements.get(id)}
const FakeDate=class extends Date{static now(){return clock}};
const window={REAL_HACHIMAN:map};
const context=vm.createContext({window,document:{querySelector:element},innerWidth:1280,innerHeight:800,devicePixelRatio:1,performance:{now:()=>clock},Date:FakeDate,Math,Image:class{},addEventListener(){},requestAnimationFrame(){},setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},console,URLSearchParams,location:{search:''}});
vm.runInContext(script,context);const race=window.testRace;
function step(n=1,dt=.016){for(let i=0;i<n;i++){clock+=dt*1000;race.update(dt)}}
function at(f,previous=f,lap=0){const p=race.base(f),q=race.base(f+.0001);Object.assign(race.me,{x:p.x,y:p.y,s:0,h:Math.atan2(q.y-p.y,q.x-p.x),camera:Math.atan2(q.y-p.y,q.x-p.x),lastT:previous,lapBase:lap,p:lap+previous})}
assert.equal(window.kartSceneData.bots.length,7);
assert.equal(window.kartSceneData.track.length,640);
assert.ok(!html.includes('legacyChoice')&&!html.includes("import('./scene3d.mjs')"));
race.start();assert.equal(race.phase(),'countdown');clock+=3001;step();assert.equal(race.phase(),'racing');
race.keys.KeyW=true;step(160);assert.ok(race.me.s>19);assert.ok(Math.hypot(race.me.x-map.route[0][0],race.me.y-map.route[0][1])>10);
const heading=race.me.h;race.keys.KeyD=true;step(24);race.keys.KeyD=false;assert.ok(race.me.h-heading<-.1,'Right input rotates clockwise in geographic east/north coordinates');
race.keys.KeyW=false;race.keys.KeyS=true;step(160);race.keys.KeyS=false;assert.ok(race.me.s<0);
// Start/reset clears momentum and item state exactly as the effective old engine did.
race.start();clock+=3001;step();assert.equal(race.me.s,0);assert.equal(race.me.item,null);
race.setItem('boost');race.useItem();assert.equal(race.me.item,null);assert.ok(race.getBoost()>clock);
race.setItem('shield');race.useItem();assert.ok(race.me.shieldUntil>clock);
race.bots[0].p=race.me.p+.1;race.setItem('missile');race.useItem();assert.ok(race.bots[0].stunUntil>clock);
race.setItem('limePool');race.useItem();assert.equal(race.getPools().length,1);
for(const b of race.bots)b.p=race.me.p+1;
race.setItem('acidRain');race.useItem();assert.ok(race.bots.every(b=>b.stunUntil>clock));
race.start();clock+=3001;step();at(.251,.249);step();assert.ok(race.me.item,'checkpoint grants an item');
race.setItem(null);at(.751,.749);step();assert.ok(race.me.item,'second checkpoint grants an item');
at(.002,.998,0);step();assert.equal(race.me.lapBase,1);assert.match(element('#lapHud').textContent,/2 \/ 3/);
at(.998,.002,1);step();assert.equal(race.me.lapBase,0,'reverse start crossing does not add a lap');
at(.002,.998,1);step();assert.equal(race.me.lapBase,2);assert.match(element('#lapHud').textContent,/3 \/ 3/);
at(.002,.998,2);step();assert.equal(race.phase(),'finished');assert.equal(element('#finish').hidden,false);
race.start();assert.equal(race.phase(),'countdown');assert.equal(element('#finish').hidden,true);assert.equal(race.me.lapBase,0);
console.log('PASS: REAL-only start, countdown, acceleration, steering, reverse, five items, both pickups, forward/reverse lap crossings, finish and retry.');
