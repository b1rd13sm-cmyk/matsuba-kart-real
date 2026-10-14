マツバカート 八幡学区 REAL

コースは八幡学区REALのみ。従来コースと画像ハリボテは削除しました。
OSMと国土地理院の実在建物8,557棟を利用します。架空の密度補完は行いません。

ローカル起動：python -m http.server 8000
http://localhost:8000/dist/index.html を開いてください。クエリは不要です。
HTMLファイルを直接開くと3Dの読み込みに失敗することがあります。
1人＋CPU7台、3周の試走版です。通信対戦サーバーは含みません。

出典、推定箇所、LOD、検証：REAL_COURSE_NOTES.md / dist/data/README.txt
地理データ生成：scripts/generate_real_course.py
検証：tests/verify_geography.py、verify_buildings.mjs、verify_race.mjs、verify_browser.py
