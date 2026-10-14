"""Generate actual OSM/GSI buildings and road surfaces; no synthetic infill.

python scripts/generate_real_course.py SOURCE.osm [--gsi dist/data/gsi-tiles]
Install scripts/requirements-geo.txt. The separately versioned course-route.json
preserves the existing race circuit, rather than choosing a new shortest path
when upstream highway connectivity changes. All 73 route node IDs are checked.
"""
import argparse, collections, gzip, hashlib, json, math, pathlib
import xml.etree.ElementTree as ET
import mapbox_vector_tile
from shapely import make_valid, normalize, set_precision
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree
ROOT=pathlib.Path(__file__).resolve().parents[1]
RADIUS=650
DRIVEABLE={'primary','secondary','tertiary','unclassified','residential','service','living_street'}
def polygons(g):
    if g.is_empty:return []
    if g.geom_type=='Polygon':return [g]
    return [p for child in getattr(g,'geoms',[]) for p in polygons(child)]
def ring(coords):return [[round(x,2),round(y,2)] for x,y in list(coords)[:-1]]
def geometry(p):return {'p':ring(p.exterior.coords),'holes':[ring(h.coords) for h in p.interiors]}
def valid(points,holes=()):
    if len(points)<3:return []
    return polygons(set_precision(make_valid(Polygon(points,holes)),.01))
def number(s):
    try:return float(str(s).replace('m','').strip())
    except (ValueError,TypeError):return None

def main():
    cli=argparse.ArgumentParser(description=__doc__);cli.add_argument('source',type=pathlib.Path)
    cli.add_argument('--gsi',type=pathlib.Path,default=ROOT/'dist/data/gsi-tiles');args=cli.parse_args()
    circuit=json.loads((ROOT/'dist/data/course-route.json').read_text())
    origin=circuit['origin'];lat,lon=origin['lat'],origin['lon'];mlon=111320*math.cos(math.radians(lat))
    route=circuit['route'];route_line=LineString(route+[route[0]])
    raw=args.source.read_bytes()
    if args.source.suffix=='.gz':raw=gzip.decompress(raw)
    osm=ET.fromstring(raw)
    poi_records=[(n.get('id'),{t.get('k'):t.get('v') for t in n.findall('tag')},float(n.get('lon')),float(n.get('lat'))) for n in osm.findall('node') if any(t.get('k') in ('shop','amenity') for t in n.findall('tag'))]
    nodes={n.get('id'):((float(n.get('lon'))-lon)*mlon,(float(n.get('lat'))-lat)*111320) for n in osm.findall('node')}
    if not all(n in nodes for n in circuit['routeOSMNodeIds']):raise RuntimeError('OSM extract is missing preserved circuit nodes')
    for n in circuit['routeOSMNodeIds']:
        if Point(nodes[n]).distance(route_line)>.1:raise RuntimeError('Route node moved upstream; manual course review required: '+n)
    ways={w.get('id'):([n.get('ref') for n in w.findall('nd')],{t.get('k'):t.get('v') for t in w.findall('tag')}) for w in osm.findall('way')}
    def base(t):
        u=(t%1)*len(route);i=int(u);f=u-i
        a,b,c,d=[route[(i+offset)%len(route)] for offset in [-1,0,1,2]]
        return [.5*(2*b[k]+(-a[k]+c[k])*f+(2*a[k]-5*b[k]+4*c[k]-d[k])*f*f+(-a[k]+3*b[k]-3*c[k]+d[k])*f*f*f) for k in range(2)]
    render_route=[base(i/640) for i in range(640)];race_line=LineString(render_route+[render_route[0]])
    records=[];invalid=[];relation_members=set()
    def assemble(refs):
        chains=[list(ways[ref][0]) for ref in refs if ref in ways];loops=[]
        while chains:
            chain=chains.pop()
            while chain[0]!=chain[-1]:
                found=False
                for i,other in enumerate(chains):
                    if chain[-1]==other[0]:chain+=other[1:]
                    elif chain[-1]==other[-1]:chain+=list(reversed(other[:-1]))
                    elif chain[0]==other[-1]:chain=other[:-1]+chain
                    elif chain[0]==other[0]:chain=list(reversed(other[1:]))+chain
                    else:continue
                    chains.pop(i);found=True;break
                if not found:break
            if chain[0]==chain[-1] and all(n in nodes for n in chain):loops.append([nodes[n] for n in chain])
        return loops
    for rel in osm.findall('relation'):
        tags={t.get('k'):t.get('v') for t in rel.findall('tag')}
        if tags.get('type')!='multipolygon' or not tags.get('building'):continue
        members=[m for m in rel.findall('member') if m.get('type')=='way']
        outers=assemble([m.get('ref') for m in members if m.get('role') in ('outer','')]);inners=assemble([m.get('ref') for m in members if m.get('role')=='inner'])
        for outer in outers:
            shell=Polygon(outer);holes=[p for p in inners if shell.covers(Polygon(p).representative_point())]
            for p in valid(outer,holes):records.append(('relation/'+rel.get('id'),p,tags,'osm',['relation/'+rel.get('id')]))
        if outers:relation_members.update(m.get('ref') for m in members)
    for ident,(ids,t) in ways.items():
        if not t.get('building') or t['building'] in ('no','collapsed','ruins') or ident in relation_members:continue
        if len(ids)<4 or ids[0]!=ids[-1] or any(n not in nodes for n in ids):invalid.append('way/'+ident);continue
        for p in valid([nodes[n] for n in ids]):records.append((ident,p,t,'osm',['way/'+ident]))
    records=[rec for rec in records if rec[1].area>=3 and rec[1].distance(route_line)<=RADIUS]
    # OSM relations supersede their member ways; suppress near-identical outlines.
    kept=[];seen=set()
    for rec in sorted(records,key=lambda rec:(rec[0].startswith('relation/'),rec[1].area),reverse=True):
        key=normalize(rec[1]).wkb
        if key in seen:continue
        if any(rec[1].intersection(old[1]).area>.25 and rec[1].intersection(old[1]).area/min(rec[1].area,old[1].area)>.005 for old in kept if rec[1].intersects(old[1])):continue
        seen.add(key);kept.append(rec)
    records=kept;osm_count=len(records)
    manifest=json.loads((args.gsi/'manifest.json').read_text());gsi_shapes=[];gsi_refs=[];codes=[];seen=set()
    for tile in manifest['tiles']:
        decoded=mapbox_vector_tile.decode((args.gsi/tile['path']).read_bytes(),default_options={'y_coord_down':True})
        layer=decoded.get('building',{});extent=layer.get('extent',4096)
        for i,f in enumerate(layer.get('features',[])):
            if f['geometry']['type'] not in ('Polygon','MultiPolygon'):continue
            def local(point):
                tx=(tile['x']+point[0]/extent)/2**manifest['zoom'];ty=(tile['y']+point[1]/extent)/2**manifest['zoom']
                lng=tx*360-180;latitude=math.degrees(math.atan(math.sinh(math.pi*(1-2*ty))))
                return ((lng-lon)*mlon,(latitude-lat)*111320)
            groups=[f['geometry']['coordinates']] if f['geometry']['type']=='Polygon' else f['geometry']['coordinates']
            for group in groups:
                rings=[[local(p) for p in r] for r in group]
                for p in valid(rings[0],rings[1:]):
                    if p.area<3 or p.distance(route_line)>RADIUS:continue
                    key=normalize(p).wkb
                    if key in seen:continue
                    seen.add(key);gsi_shapes.append(p);gsi_refs.append(f"{manifest['zoom']}/{tile['x']}/{tile['y']}#{i}");codes.append(f['properties'].get('ftCode'))
    # Rejoin clipped copies across tile seams using significant area overlap.
    tree=STRtree(gsi_shapes);parents=list(range(len(gsi_shapes)))
    def root(i):
        while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
        return i
    for i,p in enumerate(gsi_shapes):
        for j in tree.query(p,predicate='intersects'):
            j=int(j)
            if j>i and p.intersection(gsi_shapes[j]).area>3 and p.intersection(gsi_shapes[j]).area/min(p.area,gsi_shapes[j].area)>.02:parents[root(j)]=root(i)
    groups=collections.defaultdict(list)
    for i in range(len(gsi_shapes)):groups[root(i)].append(i)
    osm_tree=STRtree([rec[1] for rec in records]);duplicates=0
    for group in groups.values():
        for p in polygons(set_precision(unary_union([gsi_shapes[i] for i in group]),.01)):
            if p.area<3:continue
            if any(p.intersection(records[int(j)][1]).area>.25 and p.intersection(records[int(j)][1]).area/min(p.area,records[int(j)][1].area)>.005 for j in osm_tree.query(p,predicate='intersects')):duplicates+=1;continue
            refs=sorted(gsi_refs[i] for i in group);ident='gsi/'+hashlib.sha256(normalize(p).wkb).hexdigest()[:16]
            records.append((ident,p,{'building':'yes','gsiCode':str(codes[group[0]])},'gsi',refs))
    # Suppress tiny remaining tile/source overlap rather than double-render a facade.
    final=[];final_tree=STRtree([rec[1] for rec in records]);kept_indices=set();overlap_rejected=[]
    for i in sorted(range(len(records)),key=lambda i:(records[i][3]=='osm',records[i][1].area),reverse=True):
        rec=records[i];p=rec[1]
        if any(int(j) in kept_indices and p.intersection(records[int(j)][1]).area>.25 and p.intersection(records[int(j)][1]).area/min(p.area,records[int(j)][1].area)>.005 for j in final_tree.query(p,predicate='intersects')):
            overlap_rejected.append(rec[0]);continue
        kept_indices.add(i);final.append(rec)
    records=sorted(final,key=lambda rec:rec[0]);osm_count=sum(rec[3]=='osm' for rec in records)
    footprint_tree=STRtree([rec[1] for rec in records]);poi_by_building=collections.defaultdict(list)
    for node_id,t,lng,latitude in poi_records:
        point=Point((lng-lon)*mlon,(latitude-lat)*111320)
        for index in footprint_tree.query(point,predicate='within'):
            poi_by_building[int(index)].append({'nodeId':node_id,'tags':t})
    footprint_union=unary_union([rec[1] for rec in records]);occupied=footprint_union.buffer(.12,join_style=2)
    roads=[];water=[];land=[];school_ground=[]
    for ident,(ids,t) in ways.items():
        if len(ids)<2 or any(n not in nodes for n in ids):continue
        pts=[nodes[n] for n in ids];line=LineString(pts)
        if ident=='437104331':school_ground=ring(pts)
        if t.get('highway') in DRIVEABLE and line.distance(route_line)<RADIUS:
            kind=t['highway'];width=number(t.get('width'));measured=width is not None and width>0
            if not measured:width={'primary':8,'secondary':7,'tertiary':6.5,'unclassified':5.8,'residential':5,'service':3.8,'living_street':4}.get(kind,5)
            roads.append({'id':ident,'p':[[round(v,2) for v in p] for p in pts],'type':kind,'width':width,'widthMeasured':measured})
        if t.get('waterway') and line.distance(route_line)<RADIUS:water.append({'id':ident,'p':[[round(v,2) for v in p] for p in pts],'type':t['waterway']})
        if (t.get('landuse') in ('farmland','meadow','grass','forest','residential','orchard') or t.get('natural') in ('wood','water') or t.get('amenity')=='parking') and len(ids)>=4 and ids[0]==ids[-1]:
            for p in valid(pts):
                if p.distance(route_line)<RADIUS:land.append({'id':ident,**geometry(p),'type':'parking' if t.get('amenity')=='parking' else t.get('landuse',t.get('natural'))})
    road_tree=STRtree([LineString(road['p']) for road in roads])
    buildings=[]
    overrides=json.loads((ROOT/'dist/data/accuracy/building-overrides.json').read_text())
    school_polygon=Polygon(school_ground)
    for record_index,(ident,p,t,source,refs) in enumerate(records):
        pois=poi_by_building.get(record_index,[])
        shop_pois=[poi for poi in pois if poi['tags'].get('shop') and poi['tags']['shop']!='vacant']
        t=dict(t)
        if t.get('building')=='yes' and len(shop_pois)==1:
            t['shop']=shop_pois[0]['tags']['shop']
            if not t.get('name'):t['name']=shop_pois[0]['tags'].get('name','')
        seed=int(hashlib.sha256(ident.encode()).hexdigest()[:8],16);kind=t.get('building','yes');area=p.area
        override=overrides.get(ident,{})
        if override and (Point(override['expectedCentroid']).distance(p.centroid)>1 or abs(area-override['expectedArea'])>1):raise RuntimeError('Reviewed footprint changed: '+ident)
        on_school_site=school_polygon.covers(p.representative_point())
        kind=override.get('type',kind)
        if kind=='yes' and t.get('amenity')=='school':kind='school'
        if kind=='yes' and t.get('shop'):kind='retail'
        if kind in ('apartments','dormitory','terrace'):style='apartments'
        elif kind in ('school','university','public','civic','hospital'):style='institution'
        elif kind in ('retail','commercial','industrial','warehouse'):style='commercial'
        elif kind in ('garage','garages','shed','roof') or area<28:style='outbuilding'
        elif kind in ('house','detached','residential') or area<240:style='house'
        else:style='large-unknown'
        style=override.get('style',style)
        height=number(t.get('height'));measured=height is not None and height>0;levels=override.get('levels') or number(t.get('building:levels'))
        if not measured:height=levels*2.9+.8 if levels and levels>0 else {'house':7.2,'apartments':10.5,'institution':11.2,'commercial':7.1,'outbuilding':2.8,'large-unknown':7.6}[style]
        roof=override.get('roofShape') or t.get('roof:shape')
        if roof not in ('gabled','hipped','flat','pyramidal'):roof='gabled' if style=='house' else 'gabled' if style=='outbuilding' else 'flat'
        roof_rise=number(t.get('roof:height'))
        if roof_rise is None:roof_rise=1.2 if roof!='flat' else 0
        roof_rise=min(max(0,roof_rise),height*.3)
        level_count=levels or {'house':2,'apartments':3,'institution':3,'commercial':2,'outbuilding':1,'large-unknown':2}[style]
        buildings.append({'id':ident,**geometry(p),'height':round(height,2),'heightMeasured':measured,
            'heightSource':'height-tag' if measured else 'photo-guided-estimate' if override else 'levels-tag' if levels else 'estimated','frontEdge':min(range(len(p.exterior.coords)-1),key=lambda i:LineString(roads[int(road_tree.nearest(Point([(p.exterior.coords[i][k]+p.exterior.coords[i+1][k])/2 for k in (0,1)])))]['p']).distance(Point([(p.exterior.coords[i][k]+p.exterior.coords[i+1][k])/2 for k in (0,1)]))),
            'eaveHeight':round(height-roof_rise,2),'roofRise':round(roof_rise,2),'levels':level_count,
            'siteUse':'school' if on_school_site else None,'useSource':'school-guide-and-mapped-site' if override else 'osm-poi-inside-footprint' if len(shop_pois)==1 else 'osm-tag' if kind!='yes' else 'area-inferred',
            'evidence':{'footprint':'source-polygon; visual-aerial-review' if override else 'source-polygon-not-surveyed','height':'estimate' if not measured else 'osm-height-tag-not-independently-measured','levels':override.get('levelsSource','osm-levels-tag' if levels else 'use-based-estimate'),'roof':override.get('reviewNote','osm-roof-tag' if 'roof:shape' in t else 'use-based-estimate'),'appearance':'photo-guided-estimate' if override else 'use-based-estimate','windows':'procedural-estimate','entrance':'unverified'},
            'mappedPOIs':pois,'type':kind,'style':style,
            'name':override.get('name',t.get('name','')),'source':source,'sourceIds':refs,'footprintReal':True,'synthetic':False,
            'roofShape':roof,'roofShapeEstimated':'roof:shape' not in t,'wallColor':override.get('wallColor') or t.get('building:colour') or t.get('building:color'),
            'roofColor':override.get('roofColor') or t.get('roof:colour') or t.get('roof:color'),'appearanceEstimated':True,'seed':seed,
            'area':round(area,2),'routeDistance':round(p.distance(route_line),2),'centroid':[round(p.centroid.x,2),round(p.centroid.y,2)]})
    surfaces={}
    secondary=unary_union([LineString(road['p']).buffer(road['width']/2,join_style=2) for road in roads])
    race_surface=race_line.buffer(4.4,join_style=2)
    sidewalk=race_line.buffer(6,join_style=2).difference(race_line.buffer(4.55,join_style=2))
    edge_marks=race_line.buffer(4.1,join_style=2).difference(race_line.buffer(4,join_style=2))
    def tile_surface(g):
        result=[]
        if g.is_empty:return result
        x0,y0,x1,y1=g.bounds
        for x in range(math.floor(x0/128),math.floor(x1/128)+1):
            for y in range(math.floor(y0/128),math.floor(y1/128)+1):
                for p in polygons(g.intersection(box(x*128,y*128,(x+1)*128,(y+1)*128))):
                    if p.area>.025:result.append(geometry(p))
        return result
    for name,g in [('secondary',secondary),('race',race_surface),('sidewalk',sidewalk),('edge',edge_marks)]:surfaces[name]=tile_surface(g.difference(occupied))
    limits=[];clearance=footprint_union.buffer(1.15,join_style=2)
    for i,p in enumerate(render_route):
        q=render_route[(i+1)%640];dx=q[0]-p[0];dy=q[1]-p[1];l=math.hypot(dx,dy);nx=-dy/l;ny=dx/l;values=[]
        for side in (1,-1):
            hit=LineString([p,[p[0]+nx*side*5.15,p[1]+ny*side*5.15]]).intersection(clearance)
            values.append(round(min(5.15,Point(p).distance(hit)) if not hit.is_empty else 5.15,3))
        limits.append(values)
    conflicts=[rec[0] for rec in records if rec[1].intersects(race_line)]
    if conflicts:raise RuntimeError('Actual footprint crosses race centreline; manual map review needed: '+str(conflicts[:20]))
    bounds=osm.find('bounds');bbox=[float(bounds.get(k)) for k in ('minlon','minlat','maxlon','maxlat')]
    data={**circuit,'name':'八幡学区 REAL','license':'ODbL 1.0 (OSM); PDL 1.0 (GSI)',
        'source':'OpenStreetMap contributors + 国土地理院ベクトルタイル提供実験','sourceDate':'2026-10-14',
        'bbox':bbox,'projection':'local equirectangular metres','renderAxes':'east/up/south; map north is negative world z; WGS84 origin scale correction','accuracySources':'accuracy/sources.json','renderRoute':[[round(v,4) for v in p] for p in render_route],
        'boundaryLimits':limits,'roads':roads,'buildings':buildings,'waterways':water,'landuse':land,'schoolGround':school_ground,
        'roadSurfaces':surfaces,'coverage':{'buildingRadiusMeters':RADIUS,'roadRadiusMeters':RADIUS,'cameraFarMeters':760,'detailDistanceMeters':110,'tileSizeMeters':128},
        'sources':[{'id':'osm','name':'OpenStreetMap contributors','license':'ODbL 1.0','url':'https://www.openstreetmap.org/copyright','bbox':bbox},
                   {'id':'gsi','name':manifest['source'],'license':'PDL 1.0','url':manifest['terms'],'tileManifest':'gsi-tiles/manifest.json','dataRevision':manifest['dataRevision'],'processed':True}],
        'statistics':{'previousBuildings':749,'osmBuildings':osm_count,'gsiBuildings':len(buildings)-osm_count,'gsiDuplicateMatches':duplicates,
            'syntheticBuildings':0,'overlapRejected':overlap_rejected,'invalidOSMWays':invalid,'centrelineConflicts':conflicts,'narrowBoundarySamples':sum(min(p)<5.15 for p in limits)},
        'assumptions':{'raceRoadWidthMeters':8.8,'buildingHeightWithoutTags':'estimated by mapped use and footprint area; no ID-based jitter',
            'roadsWithoutWidthTag':'estimated by highway class; visible surfaces yield to actual building polygons',
            'elevation':'not available; planar road mesh','landmarkExteriors':'procedural, not surveyed','missingFootprints':'no synthetic infill; unmapped areas remain empty'}}
    out=ROOT/'dist/data';serialized=json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False)
    (out/'real-hachiman.json').write_text(serialized+'\n');(out/'real-hachiman.js').write_text('window.REAL_HACHIMAN='+serialized+';\n')
    with gzip.GzipFile(filename=str(out/'hachiman-osm.xml.gz'),mode='wb',mtime=0) as f:f.write(raw)
    print(json.dumps({'buildings':len(buildings),'osm':osm_count,'gsi':len(buildings)-osm_count,'roads':len(roads),'statistics':data['statistics']},ensure_ascii=False))
if __name__=='__main__':main()
