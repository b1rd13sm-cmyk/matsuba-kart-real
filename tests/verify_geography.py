"""Validate source-based buildings and playable geography after regeneration."""
import collections,gzip,json,math,pathlib,unittest,xml.etree.ElementTree as ET
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Geography(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.data=json.loads((ROOT/'dist/data/real-hachiman.json').read_text());cls.b=cls.data['buildings']
  cls.polys=[Polygon(b['p'],b['holes']) for b in cls.b]
 def test_density_and_provenance(self):
  self.assertGreater(len(self.b),749)
  self.assertEqual(len({b['id'] for b in self.b}),len(self.b))
  for b in self.b:
   self.assertTrue(b['footprintReal']);self.assertFalse(b['synthetic']);self.assertTrue(b['sourceIds']);self.assertIn(b['source'],('osm','gsi'))
  counts=collections.Counter(b['source'] for b in self.b)
  self.assertEqual(counts['osm'],self.data['statistics']['osmBuildings']);self.assertEqual(counts['gsi'],self.data['statistics']['gsiBuildings'])
 def test_preserved_race_route(self):
  circuit=json.loads((ROOT/'dist/data/course-route.json').read_text())
  for k in ('route','routeOSMNodeIds','routeLengthMeters','origin'):self.assertEqual(circuit[k],self.data[k])
  self.assertEqual(len(set(self.data['routeOSMNodeIds'])),73)
  self.assertTrue(LineString(self.data['route']+[self.data['route'][0]]).is_simple)
 def test_source_coordinates(self):
  osm=ET.fromstring(gzip.decompress((ROOT/'dist/data/hachiman-osm.xml.gz').read_bytes()))
  origin=self.data['origin'];mlon=111320*math.cos(math.radians(origin['lat']))
  nodes={n.get('id'):(round((float(n.get('lon'))-origin['lon'])*mlon,2),round((float(n.get('lat'))-origin['lat'])*111320,2)) for n in osm.findall('node')}
  ways={w.get('id'):[nodes[n.get('ref')] for n in w.findall('nd') if n.get('ref') in nodes] for w in osm.findall('way')}
  checked=0
  for b in self.b:
   if b['source']!='osm' or b['id'].startswith('relation/'):continue
   actual=set(ways[b['id']]);self.assertTrue(all(tuple(p) in actual for p in b['p']));checked+=1
  self.assertGreater(checked,749)
 def test_valid_solids_and_no_duplicate_overlap(self):
  tree=STRtree(self.polys)
  for i,p in enumerate(self.polys):
   self.assertTrue(p.is_valid);self.assertGreater(p.area,2.9);self.assertGreater(self.b[i]['height'],0)
   for j in tree.query(p,predicate='intersects'):
    j=int(j)
    if j<=i:continue
    overlap=p.intersection(self.polys[j]).area
    self.assertFalse(overlap>.5 and overlap/min(p.area,self.polys[j].area)>.01,f'{self.b[i]["id"]} overlaps {self.b[j]["id"]}')
 def test_no_building_on_drawn_roads_or_race_centre(self):
  buildings=unary_union(self.polys);route=self.data['renderRoute'];centre=LineString(route+[route[0]])
  self.assertFalse(buildings.intersects(centre))
  for name,polys in self.data['roadSurfaces'].items():
   surface=unary_union([Polygon(p['p'],p['holes']) for p in polys]);self.assertLess(surface.intersection(buildings).area,.001,name)
 def test_coverage_and_boundaries(self):
  self.assertEqual(self.data['coverage']['buildingRadiusMeters'],650)
  self.assertEqual(len(self.data['boundaryLimits']),640)
  self.assertGreater(min(min(p) for p in self.data['boundaryLimits']),1.5)
  self.assertLessEqual(max(max(p) for p in self.data['boundaryLimits']),5.15)
  js=(ROOT/'dist/data/real-hachiman.js').read_text();self.assertEqual(json.loads(js.removeprefix('window.REAL_HACHIMAN=').strip().removesuffix(';')),self.data)
if __name__=='__main__':unittest.main()
