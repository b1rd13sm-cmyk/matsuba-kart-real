"""School aerial-reference registration, edit, save, reload and comparison QA.
Reference is a GSI aerial tile, not a facade photograph; all review states remain
unverified. Test edits are local only and do not enter public course data.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
out=Path('/workspace/verification');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1400,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000/survey.html');page.wait_for_function("document.querySelector('#building').options.length===8557",timeout=90000)
 page.wait_for_function("document.querySelector('#game').contentWindow.kartSurveyRace.state().paused")
 page.locator('#upload').set_input_files('/workspace/accuracy-reference/school-aerial.jpg')
 page.wait_for_function("document.querySelector('#photo').src.startsWith('blob:')")
 page.locator('#lat').fill('35.14122');page.locator('#lon').fill('136.10001');page.locator('#height').fill('375');page.locator('#heading').fill('0');page.locator('#pitch').fill('-89');page.locator('#fov').fill('90');page.locator('#jump').click()
 page.locator('#source').fill('https://maps.gsi.go.jp/ · GSI seamlessphoto aerial, capture date unknown')
 page.locator('#referenceType').select_option('aerial');page.locator('#referenceNote').fill('航空写真のみ。外壁・高さ・地上撮影方向は未確認。')
 page.locator('#saveLocation').click();page.wait_for_function("document.querySelector('#status').textContent.includes('保存しました')")
 page.locator('#buildingHeight').fill('10');page.locator('#reviewStatus').select_option('edited');page.locator('#reviewNote').fill('動作検証用の高さ変更。実測・写真確認ではない。')
 page.locator('#saveBuilding').click();page.wait_for_function("document.querySelector('#status').textContent.includes('修正・確認状況を保存')",timeout=30000)
 page.locator('#side').click();page.wait_for_function("document.querySelector('#shot').src.startsWith('data:image/png')");assert page.locator('#comparison').get_attribute('class')=='pair'
 page.locator('#overlay').click();page.locator('#alpha').fill('0.3');page.locator('#alpha').dispatch_event('input');assert page.locator('#photo').evaluate('(e)=>e.style.opacity')=='0.3'
 page.screenshot(path=str(out/'survey-school-overlay.png'))
 with page.expect_download() as info:page.locator('#export').click()
 info.value.save_as(out/'school-survey-export.json');data=json.loads((out/'school-survey-export.json').read_text());assert data['overrides']['gsi/38549eb19a63f49c']['height']==10
 page.reload();page.wait_for_function("document.querySelector('#buildingHeight').value==='10'",timeout=90000);page.wait_for_function("document.querySelector('#photo').src.startsWith('blob:')")
 frame=page.frames[1];clock=frame.evaluate('window.kartSurveyRace.state().time');page.wait_for_timeout(800);assert frame.evaluate('window.kartSurveyRace.state().time')==clock
 with page.expect_download() as shot:page.locator('#downloadShot').click()
 shot.value.save_as(out/'survey-school-game.png');assert (out/'survey-school-game.png').stat().st_size>10000
 page.locator('#revert').click();page.wait_for_function("document.querySelector('#buildingHeight').value==='9.5'")
 page.locator('#resume').click();page.wait_for_timeout(3500);assert frame.evaluate('window.kartSurveyRace.state().phase')=='racing'
 page.locator('#pause').click();assert frame.evaluate('window.kartSurveyRace.state().paused')
 assert not errors,errors
 (out/'survey-results.json').write_text(json.dumps({'school':True,'photoPersistence':True,'editPersistence':True,'sideBySide':True,'overlay':True,'pngExport':True,'raceResume':True,'errors':errors},indent=2))
 print('PASS: school photo registration, comparison/alpha, ID edit/save/reload/revert/export, screenshot, frozen race clock, resume.')
 browser.close()
