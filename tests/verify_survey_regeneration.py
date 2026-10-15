"""Verify exported school edits survive actual source generation and road rebuild."""
import json,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[1]
paths=[root/'dist/data/real-hachiman.json',root/'dist/data/real-hachiman.js',root/'dist/data/hachiman-osm.xml.gz'];backups={p:p.read_bytes() for p in paths}
try:
 before=json.loads(backups[paths[0]])
 school=json.loads(pathlib.Path('/workspace/verification/school-survey-export.json').read_text())
 white=next(b for b in before['buildings'] if b['id']=='386119860')
 school['overrides'][white['id']]={'height':white['height'],'features':white['features'],'quality':{'status':'edited','note':'QA-only roundtrip; no additional real-world verification'}}
 export=pathlib.Path('/workspace/verification/landmark-survey-roundtrip.json');export.write_text(json.dumps(school))
 subprocess.run([sys.executable,'scripts/generate_real_course.py','dist/data/hachiman-osm.xml.gz','--survey',str(export)],cwd=root,check=True)
 before=json.loads(backups[paths[0]]);after=json.loads(paths[0].read_text());b=next(b for b in after['buildings'] if b['id']=='gsi/38549eb19a63f49c')
 assert b['height']==10 and b['survey']['status']=='edited'
 assert before['route']==after['route'] and len(before['buildings'])==len(after['buildings'])==8557
 assert after['statistics']['centrelineConflicts']==[]
 restored=next(x for x in after['buildings'] if x['id']=='386119860');assert restored['features']==white['features'] and restored['publishedOverallHeight']==12.6
 print('PASS: school and canonical tower ID edits preserved through source regeneration, 8557 real footprints, route and race-centreline safety.')
finally:
 for p,data in backups.items():p.write_bytes(data)
