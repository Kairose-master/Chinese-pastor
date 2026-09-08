#!/usr/bin/env python3
"""Rebuild data/index.json from data/sermons/*.json (+ video files if present)."""
import glob, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
items = []
for f in sorted(glob.glob(os.path.join(ROOT, "data", "sermons", "*.json"))):
    d = json.load(open(f, encoding="utf-8"))
    sid = d["id"]
    vid = os.path.join(ROOT, "data", "videos", f"{sid}.mp4")
    video = None
    if os.path.exists(vid):
        script = os.path.join(ROOT, "data", "videos", f"{sid}.script.json")
        dur = json.load(open(script))["duration"] if os.path.exists(script) else None
        video = {"mp4": f"data/videos/{sid}.mp4", "vtt": f"data/videos/{sid}.vtt", "srt": f"data/videos/{sid}.srt",
                 "poster": f"data/videos/{sid}.poster.jpg", "duration": dur, "bytes": os.path.getsize(vid)}
    items.append({"id": sid, "date": d["date"], "kind": d["kind"], "title": d["title"], "church": d["church"],
                  "ref_ko": d["scripture"]["ref_ko"], "ref_zh": d["scripture"]["ref_zh"], "one_line": d.get("one_line"),
                  "greeting": d.get("greeting"), "vocab_count": len(d.get("vocab") or []), "paragraphs": len(d["paragraphs"]),
                  "file": f"data/sermons/{sid}.json", "video": video})
# sermons the series refers to but that were not uploaded
missing = [
    {"id": "2026-07-19", "date": "2026-07-19", "kind": "adult", "placeholder": True,
     "title": {"ko": "삶의 관객이 하나뿐인 사람들", "zh": "生命中只有一个观众的人们"}, "ref_ko": "디모데후서 4:9-18", "ref_zh": "提摩太后书 4:9-18",
     "note": "2026-08-02 설교에서 언급됨 · 자료 미업로드"},
    {"id": "2026-07-26", "date": "2026-07-26", "kind": "adult", "placeholder": True,
     "title": {"ko": "그리 아니하실지라도 감사하는 사람들", "zh": "即或不然也感恩的人们"}, "ref_ko": "다니엘 3:17-18; 하박국 3:17-18", "ref_zh": "但以理书 3:17-18; 哈巴谷书 3:17-18",
     "note": "2026-08-02 설교에서 언급됨 · 자료 미업로드"},
]
index = {"generated": __import__("datetime").date.today().isoformat(), "site": {"ko": "설교로 배우는 중국어", "zh": "讲道中文"},
         "church": {"ko": "새오름교회", "zh": "言盐教会"}, "sermons": sorted(items + missing, key=lambda x: x["date"])}
json.dump(index, open(os.path.join(ROOT, "data", "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("index:", [(i["id"], bool(i.get("video"))) for i in index["sermons"]])
