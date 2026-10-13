# 八幡学区 REAL

The original hand-traced course remains the default option and its code and assets remain available. The REAL selection loads a separate OSM-derived data file and `real-scene3d.mjs` renderer. The shared race engine handles kart controls, physics, three laps, items, bots, and minimap in both.

## Provenance

- School: 近江八幡市立八幡中学校, 滋賀県近江八幡市市井町36 (school's official site). OSM way `437104331` defines the grounds.
- OpenStreetMap API 0.6 extract, bbox `136.080,35.126,136.112,35.146`, retrieved 2026-10-13. © OpenStreetMap contributors, ODbL 1.0.
- `dist/data/hachiman-osm.xml.gz` contains the raw extract; `dist/data/real-hachiman.json` contains the derived database with source IDs and estimated-value flags. These files are available for download from the Site. Rebuild with `python scripts/generate_real_course.py SOURCE.xml`.
- Coordinates use a local equirectangular approximation in metres around `(35.13838, 136.09886)`.

## Route and assumptions

- The 3,842 m closed loop follows OSM highway nodes from the school frontage, north-west turn, historic district, southern road and back to the school. Six OSM anchor nodes and shortest connected highway paths yield a simple cycle with no repeated vertex.
- Track centreline uses OSM node geometry. Resampling at 6 m intervals and spline smoothing alters the line by small amounts for kart handling. The playable strip is widened to 8.8 m even where the mapped road is narrower; roadside pavements and collision boundaries are game adjustments. Access and traffic rules were not assessed.
- 187 nearby OSM road ways, 749 building footprints, 27 waterways and 57 land parcels are incorporated. Building heights, mapped road widths, and elevation measurements were unavailable in this extract. Heights, widths, 3D architectural details, car placements, fences, utility poles and wires are inferred or illustrative. OSM outlines, school footprint and road/waterway paths are map-derived.
- One named school sign and a small set of actual OSM-named shops have procedural signs. Exterior details are not claimed to match each real building.

## Verification status

- Node syntax checks, scene construction without WebGL, route closure, mesh finite-vertex checks and original-course load checks passed.
- Direct browser rendering on iPad or Chromebook, 30 fps measurements, visual comparison on those devices, and 36-player network testing are not available in this development environment. The existing owner-private Sites build is a local-bot game with no multiplayer server; the REAL option does not add networking.
- The REAL scene avoids long wire connections between unrelated poles and uses frustum culling and instanced repeating details. The old course renderer is retained.
