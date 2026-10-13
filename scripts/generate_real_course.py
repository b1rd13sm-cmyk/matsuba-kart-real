"""Generate the separate Hachiman REAL course from an OSM 0.6 XML extract.

Source area: bbox 136.080,35.126,136.112,35.146 (downloaded 2026-10-13).
The anchor node IDs are OSM road intersections; shortest paths only follow shared
OSM highway nodes. Coordinates are equirectangular local metres relative to the
OSM school polygon centroid. Run: python scripts/generate_real_course.py SOURCE.xml
"""
import collections
import gzip
import heapq
import json
import math
import pathlib
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = pathlib.Path(sys.argv[1])
ORIGIN = (35.13838, 136.09886)
METRES_LAT = 111320
METRES_LON = METRES_LAT * math.cos(math.radians(ORIGIN[0]))
DRIVEABLE = {'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street'}
# School frontage, north bend, west-side road, south-west turn, southern road,
# east bend. Verified as a simple cycle without duplicated OSM vertices.
ANCHORS = ['1351619788', '3879382704', '1351620857', '1351620145', '6961707055', '1351618170']

r = ET.parse(SOURCE).getroot()
nodes = {n.get('id'): ((float(n.get('lon'))-ORIGIN[1])*METRES_LON,
                       (float(n.get('lat'))-ORIGIN[0])*METRES_LAT) for n in r.findall('node')}
ways = []
graph = collections.defaultdict(dict)
for w in r.findall('way'):
    tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
    ids = [n.get('ref') for n in w.findall('nd') if n.get('ref') in nodes]
    ways.append((w.get('id'), ids, tags))
    if tags.get('highway') in DRIVEABLE:
        for a,b in zip(ids,ids[1:]):
            d = math.dist(nodes[a],nodes[b]);graph[a][b] = d;graph[b][a] = d

def nearest_existing(p):
    return min(graph, key=lambda n:math.dist(nodes[n],p))

# Resolve anchor IDs against the requested geographic positions when OSM has
# refreshed minor node IDs. The exact chosen IDs and resulting geometry remain
# in the generated provenance for auditing.
TARGETS = [(174,-62),(-161,442),(-730,135),(-998,-2),(-464,-789),(382,-370)]
anchors = []
for ref,target in zip(ANCHORS,TARGETS):
    anchors.append(ref if ref in graph and math.dist(nodes[ref],target)<55 else nearest_existing(target))

def shortest(start,end):
    todo=[(0,start)];distance={start:0};previous={}
    while todo:
        cost,u=heapq.heappop(todo)
        if u==end:break
        if cost>distance[u]:continue
        for v,weight in graph[u].items():
            new=cost+weight
            if new<distance.get(v,float('inf')):
                distance[v]=new;previous[v]=u;heapq.heappush(todo,(new,v))
    if end not in distance:raise RuntimeError(f'Disconnected OSM roads: {start} -> {end}')
    result=[end]
    while result[-1]!=start:result.append(previous[result[-1]])
    return list(reversed(result))

route_ids=[]
for i,a in enumerate(anchors):route_ids.extend(shortest(a,anchors[(i+1)%len(anchors)])[:-1])
if len(route_ids)!=len(set(route_ids)):
    raise RuntimeError('The selected OSM route retraces an intersection; choose a simple loop')
raw_route=[nodes[n] for n in route_ids]
length=sum(math.dist(raw_route[i],raw_route[(i+1)%len(raw_route)]) for i in range(len(raw_route)))
route=[]
for i,p in enumerate(raw_route):
    q=raw_route[(i+1)%len(raw_route)];pieces=max(1,math.ceil(math.dist(p,q)/6))
    route.extend([[round(p[k]+(q[k]-p[k])*j/pieces,2) for k in range(2)] for j in range(pieces)])

def distance_to_route(p):
    best=1e9
    for a,b in zip(raw_route,raw_route[1:]+raw_route[:1]):
        dx,dy=b[0]-a[0],b[1]-a[1];u=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy or 1)))
        best=min(best,math.hypot(p[0]-a[0]-dx*u,p[1]-a[1]-dy*u))
    return best

def coordinates(ids):return [[round(v,2) for v in nodes[n]] for n in ids]

roads=[];buildings=[];water=[];land=[];school_ground=[]
road_degree=collections.Counter()
for ident,ids,t in ways:
    if len(ids)<2:continue
    pts=[nodes[n] for n in ids]
    if ident=='437104331':school_ground=coordinates(ids[:-1])
    proximity=min(distance_to_route(p) for p in pts)
    if t.get('highway') in DRIVEABLE and proximity<150:
        kind=t['highway'];width=t.get('width');measured=False
        try:width=float(width.replace('m','').strip());measured=True
        except (AttributeError,ValueError):width={'primary':8,'secondary':7,'tertiary':6.5,'unclassified':5.8,'residential':5,'service':3.8,'living_street':4}.get(kind,5)
        roads.append({'id':ident,'p':coordinates(ids),'type':kind,'width':width,'widthMeasured':measured})
        for a,b in zip(ids,ids[1:]):road_degree[a]+=1;road_degree[b]+=1
    if t.get('building') and t['building']!='no' and len(ids)>=4 and ids[0]==ids[-1] and proximity<150:
        btype=t['building'];height=t.get('height');measured=False
        try:height=float(height.replace('m','').strip());measured=True
        except (AttributeError,ValueError):
            try:height=float(t['building:levels'])*3+1;measured=False
            except (KeyError,ValueError):height=10 if btype in ('school','retail','commercial') else 6.6+(int(ident)%4)*.65
        buildings.append({'id':ident,'p':coordinates(ids[:-1]),'height':round(height,1),'heightMeasured':measured,
                          'type':btype,'name':t.get('name','')})
    if t.get('waterway') and proximity<170:water.append({'id':ident,'p':coordinates(ids),'type':t['waterway']})
    if (t.get('landuse') in ('farmland','meadow','grass','forest','residential') or t.get('natural') in ('wood','water') or t.get('amenity')=='parking') and len(ids)>=4 and ids[0]==ids[-1] and proximity<230:
        land.append({'id':ident,'p':coordinates(ids[:-1]),'type':'parking' if t.get('amenity')=='parking' else t.get('landuse',t.get('natural'))})

data={'name':'八幡学区 REAL','origin':{'lat':ORIGIN[0],'lon':ORIGIN[1]},'license':'ODbL 1.0',
      'source':'OpenStreetMap contributors','sourceDate':'2026-10-13',
      'bbox':[136.080,35.126,136.112,35.146],'projection':'local equirectangular metres',
      'routeOSMNodeIds':route_ids,'routeLengthMeters':round(length,1),
      'route':route,'roads':roads,'buildings':buildings,'waterways':water,'landuse':land,'schoolGround':school_ground,
      'junctions':[coordinates([n])[0] for n,degree in road_degree.items() if degree>=3 and distance_to_route(nodes[n])<150],
      'assumptions':{'raceRoadWidthMeters':8.8,'buildingHeightWithoutTags':'inferred from building type and deterministic variation',
                     'roadsWithoutWidthTag':'inferred by highway class','elevation':'not available; planar road mesh',
                     'landmarkExteriors':'procedural, not surveyed'}}
out=ROOT/'dist/data';out.mkdir(parents=True,exist_ok=True)
serialized=json.dumps(data,ensure_ascii=False,separators=(',',':'))
(out/'real-hachiman.json').write_text(serialized+'\n')
(out/'real-hachiman.js').write_text('window.REAL_HACHIMAN='+serialized+';\n')
with gzip.open(out/'hachiman-osm.xml.gz','wb',compresslevel=9) as f:f.write(SOURCE.read_bytes())
print(f"route {len(route)} points, {length:.1f} metres, {len(roads)} roads, {len(buildings)} buildings, {len(water)} waterways, {len(land)} land parcels")
