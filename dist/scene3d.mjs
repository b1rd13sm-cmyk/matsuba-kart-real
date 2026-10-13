import * as THREE from './vendor/three.module.js';

const data = window.kartSceneData;
if (data) {
  let canvas;
  try {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '0' });
    document.body.insertBefore(canvas, document.querySelector('#canvas'));
    const overlay = document.querySelector('#canvas');
    overlay.style.zIndex = '1';
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(innerWidth, innerHeight);

    const scene = new THREE.Scene();
    const sky=document.createElement('canvas');sky.width=1024;sky.height=512;
    const skyCtx=sky.getContext('2d'),grad=skyCtx.createLinearGradient(0,0,0,512);
    grad.addColorStop(0,'#75b8df');grad.addColorStop(.64,'#a8cee2');grad.addColorStop(1,'#d9ded8');
    skyCtx.fillStyle=grad;skyCtx.fillRect(0,0,1024,512);
    for(let i=0;i<28;i++){const x=(i*419)%1040,y=70+(i*71)%220,r=40+(i*43)%100,g=skyCtx.createRadialGradient(x,y,2,x,y,r);
      g.addColorStop(0,'#ffffff44');g.addColorStop(1,'#ffffff00');skyCtx.fillStyle=g;skyCtx.fillRect(x-r,y-r,r*2,r*2)}
    scene.background=new THREE.CanvasTexture(sky);
    scene.fog = new THREE.Fog('#cbd9cc', 95, 330);
    const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, .55, 350);
    scene.add(new THREE.HemisphereLight('#ffffff', '#bac0ae', 2.1));
    const sun = new THREE.DirectionalLight('#fff7e7', 1.35);
    sun.position.set(-90, 140, 40); scene.add(sun);

    const mat = (color) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    const loader = new THREE.TextureLoader();
    function texture(url) { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; }
    const pavement=texture('assets/pavement.webp');pavement.wrapS=pavement.wrapT=THREE.RepeatWrapping;pavement.repeat.set(120,120);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshLambertMaterial({ map:pavement,color:'#f1f1ed' }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.08; scene.add(ground);
    const asphalt = texture('assets/asphalt.webp'); asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
    const roadMat = new THREE.MeshLambertMaterial({ map: asphalt, color: '#e2e2e2', side: THREE.DoubleSide });
    const shoulderMat = mat('#a4a998');
    function ribbon(points, halfWidth, y, material, start=0) {
      const vertices=[], uv=[], indices=[]; let length=start;
      for(let i=0;i<points.length;i++){
        const p=points[i],next=points[(i+1)%points.length],prev=points[(i+points.length-1)%points.length];
        if(i) length+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y);
        const dx=next.x-prev.x,dz=next.y-prev.y,l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
        vertices.push(p.x+nx*halfWidth,y,p.y+nz*halfWidth,p.x-nx*halfWidth,y,p.y-nz*halfWidth);
        uv.push(0,length/7,1,length/7);
        if(i<points.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
      const m=new THREE.Mesh(g,material);scene.add(m);return m;
    }
    const route=data.track.map(p=>({x:p.x,y:p.y}));route.push({...route[0]});
    ribbon(route,data.ROAD_HALF+data.GRASS,.005,shoulderMat);
    ribbon(route,data.ROAD_HALF,.02,roadMat);

    // Fixed road paint is world geometry: it does not slide with the HUD or camera.
    const edgePaint=mat('#e5e3d8'),middlePaint=mat('#f5f4ed');
    const leftEdge=[],rightEdge=[],dashes=[];let along=0;
    for(let i=1;i<route.length;i++){
      const p=route[i-1],q=route[i],dx=q.x-p.x,dz=q.y-p.y,l=Math.hypot(dx,dz)||1,h=Math.atan2(dz,dx),nx=-dz/l,nz=dx/l;
      leftEdge.push({x:p.x+nx*(data.ROAD_HALF-.3),y:p.y+nz*(data.ROAD_HALF-.3)});
      rightEdge.push({x:p.x-nx*(data.ROAD_HALF-.3),y:p.y-nz*(data.ROAD_HALF-.3)});
      const first=Math.ceil(along/9),last=Math.floor((along+l)/9);
      for(let j=first;j<=last;j++){
        const d=Math.max(.3,Math.min(l-.3,j*9-along));
        if((i/route.length<.14||i/route.length>.68)&&l>1.1)dashes.push({x:p.x+dx*d/l,z:p.y+dz*d/l,h});
      }
      along+=l;
    }
    for(const path of [leftEdge,rightEdge]){path.push({...path[0]});ribbon(path,.067,.049,edgePaint)}
    const dashMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4,.14),middlePaint,dashes.length),dashObj=new THREE.Object3D();
    for(let i=0;i<dashes.length;i++){const d=dashes[i];dashObj.position.set(d.x,.055,d.z);dashObj.rotation.set(-Math.PI/2,-d.h,0);dashObj.updateMatrix();dashMesh.setMatrixAt(i,dashObj.matrix)}
    dashMesh.instanceMatrix.needsUpdate=true;scene.add(dashMesh);

    const canal=data.canalPixels.map(([x,y])=>data.mapPoint(x,y));
    ribbon(canal,4.1,.015,mat('#a6a39b'));ribbon(canal,3.2,.03,mat('#5a9ba3'));
    for(const [a,b] of data.sideRoadPixels){const u=data.mapPoint(...a),v=data.mapPoint(...b),dx=v.x-u.x,dz=v.y-u.y,l=Math.hypot(dx,dz),road=new THREE.Mesh(new THREE.PlaneGeometry(l,5),mat('#999d9b'));
      road.rotation.x=-Math.PI/2;road.rotation.z=0;road.rotation.y=-Math.atan2(dz,dx);road.position.set((u.x+v.x)/2,-.001,(u.y+v.y)/2);scene.add(road)}

    const white=mat('#e9e6d5'),black=mat('#26323b'),yellow=mat('#f6d83b'),pink=mat('#f23481');
    function checkpoint(t,first,second){const p=data.base(t),b=data.base(t+.0001),a=Math.atan2(b.y-p.y,b.x-p.x),group=new THREE.Group();group.position.set(p.x,.065,p.y);group.rotation.y=-a;
      for(let row=0;row<2;row++)for(let col=0;col<12;col++){const m=new THREE.Mesh(new THREE.PlaneGeometry(.6,data.ROAD_HALF*2/12),((row+col)%2?first:second));m.rotation.x=-Math.PI/2;m.position.set((row-.5)*.61,0,-data.ROAD_HALF+(col+.5)*data.ROAD_HALF*2/12);group.add(m)}scene.add(group)}
    checkpoint(0,white,black);checkpoint(.25,yellow,pink);checkpoint(.75,yellow,pink);

    for(const [px,py,w,d,c] of [[1470,210,90,90,'#b7c49a'],[1325,164,65,120,'#a8ba89'],[1650,320,80,90,'#9faa83'],[990,865,45,67,'#adb68f'],[1180,850,51,45,'#a6b288']]){
      const p=data.mapPoint(px,py),m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat(c));m.rotation.x=-Math.PI/2;m.position.set(p.x,.009,p.y);scene.add(m)}

    // The first stretch borders wide worked fields. These fixed patches replace
    // the repeated right-side houses with contiguous land as the camera advances.
    function roadsideBand(from,to,side,inner,outer,material,height=-.025){
      const vertices=[],uv=[],indices=[],steps=Math.max(5,Math.ceil((to-from)*320));
      for(let j=0;j<=steps;j++){
        const f=from+(to-from)*j/steps,p=data.base(f),u=data.base(f+.0002),v=data.base(f-.0002),dx=u.x-v.x,dz=u.y-v.y,l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
        vertices.push(p.x+nx*side*inner,height,p.y+nz*side*inner,p.x+nx*side*outer,height,p.y+nz*side*outer);
        uv.push(0,j*.55,1,j*.55);if(j){const a=(j-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();scene.add(new THREE.Mesh(g,material));
    }
    const earth=mat('#aa9e80'),earthLight=mat('#b4a58b'),earthDark=mat('#9b9279'),walkway=mat('#b2b4ad'),ditch=mat('#687c70');
    for(const [from,to,soil] of [[0,.020,earth],[.020,.040,earthLight],[.040,.056,earthDark],[.056,.074,earth]]){
      roadsideBand(from,to,-1,15,180,soil);
      roadsideBand(from,to,-1,10.7,14.6,walkway,-.009);
      roadsideBand(from,to,-1,14.2,15.3,ditch,-.013);
    }
    const hillVertices=[],hillFaces=[];
    for(let i=0;i<=70;i++){const x=-420+i*13,h=9+15*Math.sin(i*.18)**2+7*Math.sin(i*.43+1)**2;hillVertices.push(x,0,312,x,h,312);
      if(i){const a=(i-1)*2;hillFaces.push(a,a+1,a+2,a+1,a+3,a+2)}}
    const hg=new THREE.BufferGeometry();hg.setAttribute('position',new THREE.Float32BufferAttribute(hillVertices,3));hg.setIndex(hillFaces);hg.computeVertexNormals();scene.add(new THREE.Mesh(hg,mat('#566d5c')));

    const plaster=mat('#d6d3c9'),aged=mat('#ddd4c7'),stone=mat('#b8b8b2'),roof=mat('#424b50');
    const panelMats=new Map();
    function panel(kind,i){const key=kind+'_'+i;if(!panelMats.has(key)){const tex=texture('assets/scene/'+key+'.webp');panelMats.set(key,new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.075,side:THREE.DoubleSide,depthWrite:true}))}return panelMats.get(key)}
    function sideMaterial(kind){
      const c=document.createElement('canvas');c.width=256;c.height=256;const x=c.getContext('2d');
      const historic=kind==='machiya'||kind==='kura',school=kind==='school',commercial=kind==='market';
      x.fillStyle=historic?'#d6cdbb':school?'#d5d5c9':commercial?'#c3c5bc':'#d1d0c9';x.fillRect(0,0,256,256);
      // The side elevations remain dimensional when the camera passes each facade.
      for(let row=0;row<(school?3:historic?2:2);row++)for(let col=0;col<(historic?2:3);col++){
        const wx=18+col*(historic?116:77),wy=30+row*(school?73:101),ww=historic?57:52,wh=historic?60:48;
        x.fillStyle=historic?'#514c43':'#e4e1d7';x.fillRect(wx-4,wy-4,ww+8,wh+8);
        x.fillStyle=historic?'#3b3530':commercial?'#67909a':'#718d97';x.fillRect(wx,wy,ww,wh);
        x.fillStyle='#d3d8d2';x.fillRect(wx+ww*.5-2,wy,4,wh);x.fillRect(wx,wy+wh*.53,ww,3);
        if(historic){x.fillStyle='#695e4d';for(let s=8;s<ww;s+=10)x.fillRect(wx+s,wy,2,wh)}
      }
      for(let j=0;j<900;j++){const u=(j*73)%256,v=(j*149)%256;x.fillStyle=j%2?'#20271b08':'#ffffff14';x.fillRect(u,v,2,2)}
      const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshLambertMaterial({map:t});
    }
    const wallSides={historic:sideMaterial('machiya'),homes:sideMaterial('homes'),school:sideMaterial('school'),market:sideMaterial('market')};
    function dimensions(kind){return kind==='school'?[43,14,8]:kind==='arena'?[39,11,19]:kind==='market'?[35,8,14]:kind==='corner_store'?[25,7.3,11]:kind==='corner_black'?[24,6.5,10]:kind==='machiya'?[8.4,6.5,5]:kind==='kura'?[9.1,7.5,6]:kind==='store'?[9,6.7,5.5]:[9.4,7.3,6]}
    function nameplate(text,bg,fg='#fff'){
      const c=document.createElement('canvas');c.width=1024;c.height=192;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,c.width,c.height);
      x.fillStyle=fg;x.font='bold 112px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,c.width/2,c.height/2,966);
      const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide,transparent:true});
    }
    const schoolName=nameplate('近江八幡市立八幡中学校','#e5e1d5','#333d43'),arenaName=nameplate('近江八幡市民アリーナ','#e5e1d5','#32434a'),marketName=nameplate('JAグリーン近江 きてかーな','#217b39');
    const metal=mat('#57646b'),fence=mat('#818a87'),windowMat=mat('#7c969d');
    function fenceRun(group,z,w,open=0){
      const y=.7,step=1.35;
      for(let x=-w*.5;x<=w*.5;x+=step){if(Math.abs(x)<open*.5)continue;const pole=new THREE.Mesh(new THREE.BoxGeometry(.055,1.45,.06),fence);pole.position.set(x,y,z);group.add(pole)}
      for(const yy of [.4,1.28])for(const sign of [-1,1]){const span=open?(w-open)/2:w,bar=new THREE.Mesh(new THREE.BoxGeometry(span,.055,.055),fence);bar.position.set(open?sign*(open+span)/2:0,yy,z);group.add(bar)}
    }
    const buildings=[];
    for(const o of data.townPieces){
      const [w,h,d]=dimensions(o.kind),group=new THREE.Group();
      const nx=-Math.sin(o.h)*o.side,nz=Math.cos(o.h)*o.side;
      group.position.set(o.x+nx*d*.5,0,o.y+nz*d*.5);group.rotation.y=-o.h+(o.side<0?Math.PI:0);
      const wallKind=o.kind==='school'||o.kind==='arena'?'school':o.kind==='market'||o.kind==='corner_store'||o.kind==='corner_black'?'market':o.kind==='kura'||o.kind==='machiya'?'historic':'homes';
      const base=new THREE.Mesh(new THREE.BoxGeometry(w,h*.83,d),wallSides[wallKind]);base.position.y=h*.415;group.add(base);
      if(o.kind==='machiya'||o.kind==='kura'||o.kind==='homes'||o.kind==='residence'||o.kind==='store'){
        for(const zSign of [-1,1]){const roofHalf=new THREE.Mesh(new THREE.BoxGeometry(w+.85,.27,d*.56),roof);
          roofHalf.rotation.x=zSign*.22;roofHalf.position.set(0,h*.87,zSign*d*.245);group.add(roofHalf)}
      }else{const roofMesh=new THREE.Mesh(new THREE.BoxGeometry(w+.8,.42,d+.75),roof);roofMesh.position.y=h*.86;group.add(roofMesh)}
      const visual=o.sceneKind||o.kind;
      const count=visual==='machiya'?5:visual==='kura'?3:visual==='homes'?4:visual==='urban'||visual==='heritage'?6:1;
      const facade=new THREE.Mesh(new THREE.PlaneGeometry(w,h),panel(visual,o.seed%count));facade.rotation.y=Math.PI;facade.position.set(0,h*.50,-d*.5-.055);group.add(facade);
      if(o.kind==='school'){
        // Side wing and the schoolyard occupy an actual lot rather than a thin billboard.
        const wing=new THREE.Mesh(new THREE.BoxGeometry(19,10,17),plaster);wing.position.set(-w*.27,5,d*.5+8);group.add(wing);
        for(let j=0;j<2;j++)for(let k=0;k<5;k++){const win=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.5),windowMat);win.position.set(-w*.45+k*3.2,3.5+j*3,d*.5+16.52);group.add(win)}
        const yard=new THREE.Mesh(new THREE.PlaneGeometry(64,29),mat('#b6a884'));yard.rotation.x=-Math.PI/2;yard.position.set(8,-.027,d*.5+19);group.add(yard);
        fenceRun(group,-d*.5-2.1,58,7);
        for(const x of [-3.6,3.6]){const pillar=new THREE.Mesh(new THREE.BoxGeometry(.6,1.8,.65),stone);pillar.position.set(x,.9,-d*.5-2.1);group.add(pillar)}
        const plaque=new THREE.Mesh(new THREE.PlaneGeometry(8.8,.85),schoolName);plaque.rotation.y=Math.PI;plaque.position.set(-13,1,-d*.5-2.21);group.add(plaque);
      }
      if(o.kind==='arena'){
        const sign=new THREE.Mesh(new THREE.PlaneGeometry(12,1),arenaName);sign.rotation.y=Math.PI;sign.position.set(0,4,-d*.5-.13);group.add(sign);
        fenceRun(group,-d*.5-3,45,7);
      }
      if(o.kind==='market'){
        const sign=new THREE.Mesh(new THREE.PlaneGeometry(19,1.42),marketName);sign.rotation.y=Math.PI;sign.position.set(0,5.6,-d*.5-.11);group.add(sign);
        const parking=new THREE.Mesh(new THREE.PlaneGeometry(43,6),mat('#777c7a'));parking.rotation.x=-Math.PI/2;parking.position.set(0,-.02,-d*.5-3.1);group.add(parking);
        for(let k=-3;k<=3;k++){const stripe=new THREE.Mesh(new THREE.PlaneGeometry(.11,4.1),edgePaint);stripe.rotation.x=-Math.PI/2;stripe.position.set(k*5.7,-.01,-d*.5-3.1);group.add(stripe)}
      }
      if(o.kind==='corner_store'||o.kind==='corner_black'){
        const lot=new THREE.Mesh(new THREE.PlaneGeometry(w+11,8),mat('#8c8d87'));lot.rotation.x=-Math.PI/2;lot.position.set(0,-.024,-d*.5-4);group.add(lot);
        if(o.kind==='corner_store'){
          const shopName=new THREE.Mesh(new THREE.PlaneGeometry(12,1),nameplate('コンビニエンスストア','#0950a8'));shopName.rotation.y=Math.PI;shopName.position.set(0,4.7,-d*.5-.13);group.add(shopName)
        }
      }
      scene.add(group);buildings.push({group,o});
    }
    const poleMat=mat('#70716d'),wireMat=new THREE.LineBasicMaterial({color:'#65696b',transparent:true,opacity:.5});
    for(const p of data.streetPoles){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.14,9,6),poleMat);pole.position.set(p.x,4.5,p.y);scene.add(pole);
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,2,5),poleMat);arm.rotation.z=Math.PI/2;arm.position.set(p.x,8,p.y);scene.add(arm)}
    for(let i=0;i<data.streetPoles.length;i++){const p=data.streetPoles[i],q=data.streetPoles[(i+1)%data.streetPoles.length];if(Math.hypot(p.x-q.x,p.y-q.y)>80)continue;
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x,8.2,p.y),new THREE.Vector3((p.x+q.x)/2,7.4,(p.y+q.y)/2),new THREE.Vector3(q.x,8.2,q.y)]),wireMat);scene.add(line)}
    const roadside=(f,side,offset)=>{const p=data.base(f),q=data.base(f+.0002),v=data.base(f-.0002),h=Math.atan2(q.y-v.y,q.x-v.x);return {x:p.x-Math.sin(h)*offset*side,z:p.y+Math.cos(h)*offset*side,h}};
    // Low brick plinth and open metal mesh mark the school boundary on the left.
    const schoolFenceMat=mat('#596565'),brick=mat('#565c57');
    for(let i=0;i<18;i++){
      const f=.001+i*.002,p=roadside(f,1,data.ROAD_HALF+3.1),q=roadside(f+.002,1,data.ROAD_HALF+3.1),len=Math.hypot(q.x-p.x,q.z-p.z),a=Math.atan2(q.z-p.z,q.x-p.x),g=new THREE.Group();
      g.position.set((p.x+q.x)/2,0,(p.z+q.z)/2);g.rotation.y=-a;
      const wall=new THREE.Mesh(new THREE.BoxGeometry(len+.15,.47,.23),brick);wall.position.y=.23;g.add(wall);
      for(const x of [-len/2,len/2]){const pole=new THREE.Mesh(new THREE.BoxGeometry(.06,1.9,.06),schoolFenceMat);pole.position.set(x,1.33,0);g.add(pole)}
      for(const y of [.65,1.25,2.06]){const rail=new THREE.Mesh(new THREE.BoxGeometry(len,.045,.05),schoolFenceMat);rail.position.y=y;g.add(rail)}scene.add(g)
    }
    // Repeated poles and sagging wires frame both sides of the approach.
    for(const side of [-1,1]){
      let prev=null;
      for(let i=0;i<9;i++){
        const p=roadside(.004+i*.0087,side,data.ROAD_HALF+(side===1?5.5:8));
        const pole=new THREE.Mesh(new THREE.CylinderGeometry(.10,.17,11.5,7),poleMat);pole.position.set(p.x,5.75,p.z);scene.add(pole);
        const arm=new THREE.Mesh(new THREE.BoxGeometry(2.2,.08,.12),poleMat);arm.rotation.y=-p.h;arm.position.set(p.x,10.8,p.z);scene.add(arm);
        if(prev)for(const y of [10.2,10.65,11.0]){const curve=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(prev.x,y,prev.z),new THREE.Vector3((prev.x+p.x)/2,y-.55,(prev.z+p.z)/2),new THREE.Vector3(p.x,y,p.z)]),wireMat);scene.add(curve)}prev=p;
      }
    }
    const treeTrunk=mat('#726754'),leaf=mat('#587a4d');
    for(let i=3;i<canal.length-2;i+=3){const p=canal[i],trunk=new THREE.Mesh(new THREE.CylinderGeometry(.11,.16,3.4,5),treeTrunk);trunk.position.set(p.x+5,1.7,p.y+6);scene.add(trunk);
      const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2.4,1),leaf);crown.position.set(p.x+5,4.3,p.y+6);scene.add(crown)}

    const kartBody=new THREE.BoxGeometry(1.6,.55,2.15),kartTop=new THREE.BoxGeometry(1.1,.5,.9),wheelShape=new THREE.BoxGeometry(.3,.52,.56);
    const tire=mat('#1a1e22'),glass=mat('#7babb9');
    function makeKart(color){const g=new THREE.Group(),body=new THREE.Mesh(kartBody,mat(color)),top=new THREE.Mesh(kartTop,glass);
      body.position.y=.55;top.position.set(0,1.03,-.12);g.add(body,top);
      for(const x of [-.93,.93])for(const z of [-.73,.73]){const wheel=new THREE.Mesh(wheelShape,tire);wheel.position.set(x,.35,z);g.add(wheel)}
      const spoiler=new THREE.Mesh(new THREE.BoxGeometry(1.8,.13,.38),black);spoiler.position.set(0,1.16,-.97);g.add(spoiler);
      scene.add(g);return g}
    const playerKart=makeKart('#00cce8');
    const bots=data.bots.map(b=>({b,g:makeKart(b.color)}));
    function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()}
    window.addEventListener('resize',resize);
    window.renderKartScene=(me)=>{
      const fx=Math.cos(me.camera),fz=Math.sin(me.camera);
      camera.position.set(me.x-fx*5.2,3.75,me.y-fz*5.2);camera.lookAt(me.x+fx*21,1.4,me.y+fz*21);
      playerKart.position.set(me.x,.08,me.y);playerKart.rotation.y=-me.h+Math.PI/2;
      for(const {b,g} of bots){g.position.set(b.x,.08,b.y);g.rotation.y=-b.h+Math.PI/2}
      renderer.render(scene,camera);
    };
  } catch(err) { console.warn('3D rendering unavailable; using canvas scenery.',err); canvas?.remove(); }
}
