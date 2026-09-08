#!/usr/bin/env python3
"""Enrich a raw sermon JSON (from extract_pptx.py) with Gemini:
summary, outline, key sentences, Chinese vocabulary (+pinyin), grammar points,
Korean vocabulary for Chinese speakers, quiz, and a short-video narration.

Usage: python3 pipeline/enrich.py data/raw/2026-08-30.raw.json -o data/sermons/2026-08-30.json
Cost: one gemini-2.5-pro call per sermon (~25–40k input tokens).
"""
import argparse, json, os, re, sys
from pypinyin import pinyin, Style
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gemini
from bible import passage, KO_NAMES, BOOKS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KO2ZH_BOOK = {v: k for k, v in KO_NAMES.items()}

PUNCT = {"，": ", ", "。": ". ", "！": "! ", "？": "? ", "；": "; ", "：": ": ", "、": ", "}
def to_pinyin(text):
    py = " ".join(x[0] for x in pinyin(text, style=Style.TONE, heteronym=False))
    py = re.sub(r"\s*([，。！？；：、“”‘’（）…])\s*", lambda m: PUNCT.get(m.group(1), ""), py)
    return re.sub(r"\s+", " ", py).strip()

PROMPT_ADULT = open(os.path.join(ROOT, "data", "prompts", "adult.txt"), encoding="utf-8").read()

PROMPT_KIDS = open(os.path.join(ROOT, "data", "prompts", "kids.txt"), encoding="utf-8").read()

def ref_to_zh(ref_ko):
    m = re.match(r"([가-힣]+)\s*(\d+):(\d+)(?:-+(\d+))?", ref_ko.replace("--", "-"))
    book = KO2ZH_BOOK[m.group(1)]
    rng = m.group(3) + (f"-{m.group(4)}" if m.group(4) else "")
    return f"{book} {m.group(2)}:{rng}"

def enrich(raw):
    ref_zh = raw["scripture"].get("ref_zh") or ref_to_zh(raw["scripture"]["ref_ko"])
    ref_zh = ref_zh.replace("--", "-")
    bible = passage(ref_zh)
    # keep the deck's own verse text (개역개정 / 和合本 as projected) and add the API text as reference
    verses = []
    deck_by_n = {v["n"]: v for v in raw["scripture"]["verses"]}
    for v in bible["verses"]:
        d = deck_by_n.get(v["n"], {})
        verses.append({"n": v["n"], "zh": d.get("zh") or v["zh"], "ko": d.get("ko") or v["ko"],
                       "zh_cunps": v["zh"], "ko_krv": v["ko"], "zh_from_deck": bool(d.get("zh")), "ko_from_deck": bool(d.get("ko"))})
    scripture = {"ref_ko": raw["scripture"]["ref_ko"].replace("--", "-"), "ref_zh": ref_zh, "verses": verses,
                 "deck_ko_version": "개역개정 (deck)" if any(v["ko_from_deck"] for v in verses) else "개역한글 (KRV)",
                 "deck_zh_version": "和合本 (deck)" if any(v["zh_from_deck"] for v in verses) else "和合本 CUNPS (bolls.life)"}
    scripture_zh = "\n".join(f"{v['n']} {v['zh']}" for v in verses)

    if raw["kind"] == "kids":
        blocks = "\n".join(f"[{i}] " + " / ".join(p["kids_block"]) for i, p in enumerate(raw["paragraphs"]))
        prompt = PROMPT_KIDS.replace("{date}", raw["date"]).replace("{title_ko}", raw["title"]["ko"]) \
            .replace("{ref_ko}", scripture["ref_ko"]).replace("{scripture_zh}", scripture_zh).replace("{blocks}", blocks)
    else:
        paras = "\n".join(f"[{i}] ko: {p['ko']}\n[{i}] zh: {p['zh']}" for i, p in enumerate(raw["paragraphs"]))
        greeting = " / ".join(raw["greeting"]["ko"]) + " ｜ " + " / ".join(raw["greeting"]["zh"]) if raw.get("greeting") else ""
        prompt = PROMPT_ADULT.replace("{date}", raw["date"]).replace("{title_ko}", raw["title"]["ko"] or "") \
            .replace("{title_zh}", raw["title"]["zh"] or "").replace("{ref_ko}", scripture["ref_ko"]) \
            .replace("{greeting}", greeting).replace("{scripture_zh}", scripture_zh).replace("{paragraphs}", paras)
    print(f"  prompt chars={len(prompt)}", file=sys.stderr)
    ai = gemini.generate_json(prompt)

    out = dict(raw)
    out["id"] = raw["date"]
    out["title"] = {"ko": raw["title"]["ko"], "zh": raw["title"].get("zh") or ai.get("title_zh")}
    out["scripture"] = scripture
    if raw["kind"] == "kids":
        bz = ai.get("blocks_zh", [])
        for i, p in enumerate(out["paragraphs"]):
            if i < len(bz):
                p["zh_lines"] = bz[i].get("zh_lines", [])
                p["zh"] = " / ".join(p["zh_lines"])
                p["zh_machine"] = True
    for k in ("summary", "one_line", "outline", "key_sentences", "grammar", "ko_vocab", "quiz", "corrections"):
        out[k] = ai.get(k)
    vocab = []
    for i, w in enumerate(ai.get("vocab", [])):
        w = dict(w); w["pinyin"] = to_pinyin(w["zh"]); w.setdefault("video", i < 5)
        vocab.append(w)
    out["vocab"] = vocab
    for s in out["key_sentences"] or []:
        s["pinyin"] = to_pinyin(s["zh"])
    for v in out["scripture"]["verses"]:
        v["pinyin"] = to_pinyin(v["zh"])
    vid = ai.get("video") or {}
    out["video"] = {"beats": vid if isinstance(vid, list) else vid.get("beats", [])}
    for b in out["video"]["beats"]:
        b["pinyin"] = to_pinyin(b["zh"])
    out["enriched_with"] = gemini.TEXT_MODEL
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("raw"); ap.add_argument("-o", "--out")
    a = ap.parse_args()
    raw = json.load(open(a.raw, encoding="utf-8"))
    print(f"enriching {raw['date']} {raw['title']['ko']}", file=sys.stderr)
    out = enrich(raw)
    path = a.out or os.path.join(ROOT, "data", "sermons", f"{raw['date']}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"wrote {path}: vocab={len(out['vocab'])} quiz={len(out['quiz'] or [])} beats={len(out['video']['beats'])} "
          f"corrections={len(out['corrections'] or [])} calls={gemini.CALLS}", file=sys.stderr)
