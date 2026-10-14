"""Apply ID-keyed developer exports before surfaces/collision limits are rebuilt.
No photo pixels are imported into public course assets. References are metadata.
"""
import json, math, re
from shapely.geometry import Polygon, LineString
from shapely.affinity import rotate, translate
from shapely.ops import unary_union

def apply_survey(buildings, records, roads, route, path):
    if path is None:return buildings,records
    doc=json.loads(path.read_text())
    if doc.get('schemaVersion')!=1 or not isinstance(doc.get('overrides'),dict):raise ValueError('Unsupported survey schema')
    index={b['id']:b for b in buildings};missing=set(doc['overrides'])-set(index)
    if missing:raise ValueError('Survey IDs missing after regeneration: '+str(sorted(missing)))
    originals={b['id']:Polygon(b['p'],b['holes']) for b in buildings};edited={};line=LineString(route+[route[0]])
    road=unary_union([LineString(r['p']).buffer(r['width']/2) for r in roads]+[line.buffer(4.4)])
    for ident,e in doc['overrides'].items():
        b=index[ident];source=originals[ident];p=Polygon(e.get('p',b['p']),e.get('holes',b['holes']))
        p=translate(rotate(p,float(e.get('rotation',0)),origin=tuple(b['centroid'])),*e.get('offset',[0,0]))
        if not p.is_valid or p.area<1:raise ValueError('Invalid survey footprint: '+ident)
        if p.intersects(line):raise ValueError('Survey footprint crosses course: '+ident)
        if not p.equals(source) and p.intersection(road).difference(source.buffer(.02)).area>.01:raise ValueError('Survey footprint introduces road intrusion: '+ident)
        edited[ident]=p
        for key in ('wallColor','roofColor'):
            if key in e:
                if not re.fullmatch(r'#[0-9a-fA-F]{6}',e[key]):raise ValueError('Invalid color')
                b[key]=e[key]
        for key,maximum in [('height',120),('levels',30)]:
            if key in e:
                value=float(e[key])
                if not math.isfinite(value) or not 0<value<=maximum:raise ValueError('Invalid height/levels')
                b[key]=value
        if 'roofShape' in e:
            if e['roofShape'] not in ('flat','gabled','hipped','pyramidal','shed'):raise ValueError('Invalid roof')
            b['roofShape']=e['roofShape']
        for key in ('type','wallMaterial'): 
            if key in e:b[key]=str(e[key])[:100]
        if 'type' in e:
            uses={'apartments':('apartments','dormitory','terrace'),'institution':('school','university','public','civic','hospital'),'commercial':('retail','commercial','industrial','warehouse'),'outbuilding':('garage','garages','shed','roof'),'house':('house','detached','residential')}
            b['style']=next((style for style,kinds in uses.items() if b['type'] in kinds),b['style'])
        features=e.get('features',[])
        if len(features)>100:raise ValueError('Too many features')
        for f in features:
            if f.get('kind') not in ('window','door','sign','fence','parking','plant') or any(not isinstance(f.get(k),(float,int)) or not math.isfinite(f[k]) for k in ('x','y','z','width','height','depth')) or not 0<min(f['width'],f['height'],f['depth']) or max(f['width'],f['height'],f['depth'])>100:raise ValueError('Invalid feature')
        quality=e.get('quality',{})
        if (quality.get('status')=='reviewed' or any(quality.get(k) in ('matched','approximate') for k in ('position','shape','color'))) and (not quality.get('reference',{}).get('source') or not quality.get('note') or quality.get('reference',{}).get('type')=='test'):raise ValueError('Verified survey needs reference and review note')
        b.update(p=[[round(x,2),round(y,2)] for x,y in list(p.exterior.coords)[:-1]],holes=[[[round(x,2),round(y,2)] for x,y in list(h.coords)[:-1]] for h in p.interiors],centroid=[round(p.centroid.x,2),round(p.centroid.y,2)],features=features,survey=quality,appearanceEstimated=True,heightMeasured=False,area=round(p.area,2),routeDistance=round(p.distance(line),2))
        b['roofRise']=0 if b['roofShape']=='flat' else min(b['roofRise'] or 1.2,b['height']*.3);b['eaveHeight']=b['height']-b['roofRise'];b['heightSource']='developer-survey-estimate';b['evidence']['developerReview']=quality
    all_polygons={**originals,**edited}
    for ident,p in edited.items():
        if p.equals(originals[ident]):continue
        for other,q in all_polygons.items():
            if ident!=other and p.intersection(q).area>.01:raise ValueError('Survey building overlaps '+other)
    records=[(ident,edited.get(ident,p),t,source,refs) for ident,p,t,source,refs in records]
    return buildings,records
