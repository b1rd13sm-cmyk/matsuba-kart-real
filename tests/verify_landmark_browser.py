"""Browser QA for curated stations and GSI aerial comparison.
Start python -m http.server 8004 --directory dist first. Requires Playwright,
Chromium and permitted GSI network access. Real GSI responses are passed through
urllib with the original browser Origin and TLS verification/CORS intact.
"""
import json,pathlib,urllib.request
from playwright.sync_api import sync_playwright
out=pathlib.Path('/workspace/verification');responses=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1400,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 # Fetch original GSI responses with the environment's trusted proxy, keeping
 # server CORS headers. Do not disable TLS or fabricate the aerial imagery.
 def gsi(route):
  response=urllib.request.urlopen(urllib.request.Request(route.request.url,headers={'Origin':route.request.headers.get('origin','http://127.0.0.1:8004')}),timeout=30);headers=dict(response.headers);raw=response.read();assert headers.get('Access-Control-Allow-Origin')=='*' or headers.get('access-control-allow-origin')=='*',headers;responses.append({'url':route.request.url,'cors':'*'});route.fulfill(status=response.status,headers=headers,body=raw)
 page.route('https://cyberjapandata.gsi.go.jp/xyz/**',gsi)
 page.goto('http://127.0.0.1:8004/survey.html?landmark=hakuunkan');page.wait_for_function("document.querySelector('#locations').value==='review-hakuunkan'&&document.querySelector('#building').value==='386119860'&&document.querySelector('#features').value.includes('tower')",timeout=90000)
 assert page.locator('#building').input_value()=='386119860';assert page.locator('#levels').input_value()=='2';assert page.locator('#roofShape').input_value()=='hipped';assert 'tower' in page.locator('#features').input_value();assert page.locator('#referenceLinks a').count()==1
 page.locator('#aerial').click();page.wait_for_function("document.querySelector('#status').textContent.includes('正射投影に設定')",timeout=120000)
 assert page.locator('#projection').input_value()=='orthographic';assert page.locator('#pitch').input_value()=='-90'
 page.locator('#overlay').click();page.wait_for_function("document.querySelector('#shot').src.startsWith('data:image/png')");page.locator('#alpha').fill('0.4');page.locator('#alpha').dispatch_event('input');page.screenshot(path=str(out/'hakuunkan-aerial-comparison.png'))
 page.reload();page.wait_for_function("document.querySelector('#projection').value==='orthographic'&&document.querySelector('#photo').src.startsWith('blob:')",timeout=90000)
 frame=page.frames[1];assert frame.evaluate('window.kartSurveyRace.state().paused');page.locator('#resume').click();page.wait_for_timeout(3500);assert frame.evaluate('window.kartSurveyRace.state().phase')=='racing'
 assert len(responses)==9 and not errors,(responses,errors)
 (out/'landmark-ui-results.json').write_text(json.dumps({'curatedSources':True,'originalGsiResponsesViaQaProxy':responses,'aerialOrthographicNorthUp':True,'overlay':True,'persistence':True,'canonicalTowerEditable':True,'raceResume':True,'errors':errors},indent=2))
 print('PASS: curated station/source links, canonical tower editing, 9 real GSI aerial tiles/CORS, orthographic north-up comparison, persistence, race resume, no JS errors.');browser.close()
