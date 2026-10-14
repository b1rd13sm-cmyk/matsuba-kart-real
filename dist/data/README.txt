八幡学区 REAL 地理データ（2026-10-14更新）

道路・学校敷地・一部建物：© OpenStreetMap contributors、ODbL 1.0
https://www.openstreetmap.org/copyright
OSM取得元：https://api.openstreetmap.org/api/0.6/map?bbox=136.076,35.122,136.119,35.151

建物補完：国土地理院ベクトルタイル提供実験を加工して作成。
https://github.com/gsi-cyberjapan/gsimaps-vector-experiment
https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html
国土地理院コンテンツ利用規約（公共データ利用規約PDL 1.0）に従い、出典と加工を明示。
取得日2026-10-14（日本時間）、提供者更新情報2026-07-01。

収録建物8,557棟：OSM 1,175棟＋国土地理院7,382棟。架空の補完建物0棟。
コースから650 m以内。OSM優先で重複除去、国土地理院のタイル継ぎ目を接合。
位置をずらして密度を作る処理はありません。描画距離は760 m、詳細は110 m以内。

real-hachiman.json / real-hachiman.js：抽出・加工済みのゲーム地理データ。
course-route.json：既存のREAL経路を固定したOSM由来データ。
hachiman-osm.xml.gz：OSM元抽出データ。
gsi-tiles/manifest.json：42タイルのURL・ズーム・取得範囲・条件。
gsi-tiles/*.pbf：国土地理院の元ベクトルタイル。ゲームは実行時に取得しません。

座標系：北緯35.13838、東経136.09886を原点とする局所メートル座標。
全建物にsource/sourceIds/footprintReal/syntheticを記録し、実在外形と推定外観を分離。
高さ、用途未登録時の種別、屋根、窓、玄関、色、電柱、フェンスは推定が含まれます。
建物が重なる候補の除外IDはstatistics.overlapRejectedを参照。
両データに未登録の場所は補完しません。現在の現地の完全な再現を保証するデータではありません。

道幅は推定で、レース用の最大8.8 m幅へ調整しています。建物の輪郭は移動せず、
道路面・歩道・白線から実在外形を差し引きます。狭い路肩では走行境界を外壁に合わせます。
標高は未導入、実際の交通規制を再現する経路ではありません。

位置・形状精度更新：accuracy/sources.json、accuracy/building-overrides.jsonを参照。
全建物のevidenceに、位置・全高・階数・屋根・外観・窓・玄関の確認状態を記録。
位置と外形は維持し、3Dはeast/up/southとWGS84原点の局所縮尺を使用。
八幡中学校の公式要覧の写真で確認できた校舎の一部を外観推定の根拠に使用。
全棟を測量・写真照合したものではありません。未確認の物理看板・車は描画しません。
