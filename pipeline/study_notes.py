#!/usr/bin/env python3
"""Generate a Chinese Bible-study sheet (中文查经) for a passage: background, structure, key words
with 和合本 wording (+ Greek/Hebrew root where useful), interpretation points, discussion questions,
and Korean glosses throughout. Clearly labelled as AI study notes — NOT a quotation of any commentary.

Usage: python3 pipeline/study_notes.py "罗马书 8:35-39" ["使徒行传 1:12-14" ...]
Output: data/study/<book>.<chapter>.<v1>-<v2>.json
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gemini
from bible import passage
from enrich import to_pinyin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, "data", "study")

PROMPT = open(os.path.join(ROOT, "data", "prompts", "study.txt"), encoding="utf-8").read()

def make(ref):
    p = passage(ref)
    text = "\n".join(f"{v['n']} {v['zh']}" for v in p["verses"])
    notes = gemini.generate_json(PROMPT.replace("{ref}", p["ref"]).replace("{text}", text), temperature=0.3)
    notes["ref"] = p["ref"]; notes["ref_ko"] = p["ref_ko"]
    notes["verses"] = [{"n": v["n"], "zh": v["zh"], "ko": v["ko"], "pinyin": to_pinyin(v["zh"])} for v in p["verses"]]
    for k in notes.get("keywords", []):
        k["pinyin"] = to_pinyin(k["zh"])
    if notes.get("memory_verse", {}).get("zh"):
        notes["memory_verse"]["pinyin"] = to_pinyin(notes["memory_verse"]["zh"])
    notes["generated_by"] = gemini.TEXT_MODEL
    notes["disclaimer_ko"] = "이 자료는 Gemini가 和合本 본문을 바탕으로 작성한 AI 학습 노트입니다. 특정 주석서의 인용이 아니며, 원어·역사 정보는 아래 참고 사이트에서 확인하세요."
    m = re.match(r"(\S+)\s+(\d+):(\d+)(?:-(\d+))?", p["ref"])
    fname = f"{m.group(1)}.{m.group(2)}.{m.group(3)}-{m.group(4) or m.group(3)}.json"
    os.makedirs(OUTDIR, exist_ok=True)
    json.dump(notes, open(os.path.join(OUTDIR, fname), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"wrote data/study/{fname}", file=sys.stderr)
    return fname

if __name__ == "__main__":
    for r in sys.argv[1:]:
        make(r)
