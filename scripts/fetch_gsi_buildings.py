"""Cache the actual GSI building polygon tiles; no generated footprints.

Install scripts/requirements-geo.txt first. GSI vector tile experiment is used
under the GSI content terms (PDL 1.0); see dist/data/README.txt.
"""
import concurrent.futures
import json
import math
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'dist/data/real-hachiman.json').read_text())
lat, lon = data['origin']['lat'], data['origin']['lon']
metres_lon = 111320 * math.cos(math.radians(lat))
route = data['route']
box = [lon + (min(p[0] for p in route)-700)/metres_lon,
       lat + (min(p[1] for p in route)-700)/111320,
       lon + (max(p[0] for p in route)+700)/metres_lon,
       lat + (max(p[1] for p in route)+700)/111320]
zoom = 16
def tile(lng, latitude):
    return (int((lng+180)/360*2**zoom),
            int((1-math.asinh(math.tan(math.radians(latitude)))/math.pi)/2*2**zoom))
x0, y0 = tile(box[0], box[3])
x1, y1 = tile(box[2], box[1])
out = ROOT / 'dist/data/gsi-tiles'
out.mkdir(exist_ok=True)
def fetch(xy):
    x,y=xy
    url=f'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{zoom}/{x}/{y}.pbf'
    path=out/f'{zoom}-{x}-{y}.pbf'
    if not path.exists():
        with urllib.request.urlopen(url, timeout=35) as response:
            path.write_bytes(response.read())
    return {'x':x,'y':y,'path':path.name,'url':url}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    tiles=list(pool.map(fetch,[(x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)]))
(out/'manifest.json').write_text(json.dumps({'zoom':zoom,'bbox':box,'sourceDate':'2026-10-14',
    'source':'国土地理院ベクトルタイル提供実験','dataRevision':'2026-07-01 (provider README)',
    'terms':'https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html','tiles':tiles},ensure_ascii=False,indent=2)+'\n')
print(f'Cached {len(tiles)} GSI tiles; bbox {box}')
