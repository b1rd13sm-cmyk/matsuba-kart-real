"""Portable browser QA. Start python -m http.server 8000 in dist first.

Requires Playwright and Chromium. Emulated viewports are not physical-device
performance measurements. Screenshots and results are written outside source.
"""
import json,pathlib
from playwright.sync_api import sync_playwright
OUT=pathlib.Path('/workspace/verification');OUT.mkdir(exist_ok=True)
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for name,width,height,touch,query in [('chromebook',1366,768,False,''),('ipad',1024,768,True,'?course=legacy'),('portrait',768,1024,True,'?course=real')]:
  context=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,device_scale_factor=1)
  page=context.new_page();errors=[];failed=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
  response=page.goto('http://127.0.0.1:8000/'+query,wait_until='load')
  page.wait_for_function('window.kartSceneStats?.loadedTiles>20',timeout=60000)
  assert response.status==200 and page.locator('.coursechoice').count()==0
  assert page.locator('#courseTitle').inner_text().startswith('八幡学区 REAL')
  page.screenshot(path=str(OUT/(name+'-title.png')))
  page.locator('#startBtn').click();page.wait_for_timeout(3500)
  if touch:
   gas=page.locator('#gas').bounding_box();page.mouse.move(gas['x']+gas['width']/2,gas['y']+gas['height']/2);page.mouse.down();page.wait_for_timeout(1200);page.mouse.up()
  else:
   page.keyboard.down('w');page.wait_for_timeout(1200);page.keyboard.up('w')
  speed=page.locator('#speed').inner_text();assert int(speed.split()[0])>0,speed
  assert page.locator('#lapHud').inner_text()=='1 / 3'
  for selector in ['#gas','#stick','#item']:
   b=page.locator(selector).bounding_box();assert b['x']>=0 and b['y']>=0 and b['x']+b['width']<=width+1 and b['y']+b['height']<=height+1,(name,selector,b)
  page.screenshot(path=str(OUT/(name+'-race.png')))
  frame=page.evaluate('''async()=>{const times=[];let last=performance.now();for(let i=0;i<12;i++)await new Promise(resolve=>requestAnimationFrame(t=>{times.push(t-last);last=t;resolve()}));times.sort((a,b)=>a-b);return {medianFrameMs:times[6],p95FrameMs:times[11]}}''')
  stats=page.evaluate('window.kartSceneStats');assert stats['totalBuildings']>749;assert stats['visibleBuildings']>0
  assert not errors and not failed,(errors,failed)
  results.append({'viewport':name,'size':[width,height],'touchControls':touch,'query':query,'speed':speed,'stats':stats,'frames':frame,'errors':errors,'failedResources':failed})
  if name=='chromebook':
   for f,label in [(.18,'historic'),(.46,'south'),(.85,'school-approach')]:
    page.evaluate('''f=>{const original=window.__originalRenderer||(window.__originalRenderer=window.renderKartScene);window.renderKartScene=me=>{const p=window.kartSceneData.base(f),q=window.kartSceneData.base(f+.0001),h=Math.atan2(q.y-p.y,q.x-p.x);original({...me,x:p.x,y:p.y,h,camera:h})}}''',f)
    page.wait_for_timeout(1800);page.screenshot(path=str(OUT/(label+'.png')))
  context.close()
 browser.close()
(OUT/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(results,ensure_ascii=False))
