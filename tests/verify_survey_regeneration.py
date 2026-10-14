"""Verify exported school edits survive actual source generation and road rebuild."""
import json,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[1]
paths=[root/'dist/data/real-hachiman.json',root/'dist/data/real-hachiman.js',root/'dist/data/hachiman-osm.xml.gz'];backups={p:p.read_bytes() for p in paths}
try:
 subprocess.run([sys.executable,'scripts/generate_real_course.py','dist/data/hachiman-osm.xml.gz','--survey','/workspace/verification/school-survey-export.json'],cwd=root,check=True)
 before=json.loads(backups[paths[0]]);after=json.loads(paths[0].read_text());b=next(b for b in after['buildings'] if b['id']=='gsi/38549eb19a63f49c')
 assert b['height']==10 and b['survey']['status']=='edited'
 assert before['route']==after['route'] and len(before['buildings'])==len(after['buildings'])==8557
 assert after['statistics']['centrelineConflicts']==[]
 print('PASS: school ID edit preserved through source regeneration, 8557 real footprints, route and race-centreline safety.')
finally:
 for p,data in backups.items():p.write_bytes(data)
