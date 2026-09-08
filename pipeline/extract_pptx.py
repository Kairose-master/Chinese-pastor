#!/usr/bin/env python3
"""Turn a 새오름교회 / 言盐教会 worship deck (.pptx) into a structured sermon JSON.

The decks follow one layout: Apostles' Creed → hymn lyric slides (zh line / ko line)
→ "오늘의 말씀" scripture slides (numbered verses, zh + ko) → offering → sermon title
slide → sermon body (one paragraph per slide, Korean block then Chinese block)
→ closing hymn → benediction.  Children's decks (유치부) are Korean-only.

Usage: python3 pipeline/extract_pptx.py deck.pptx [-o out.json]
"""
import argparse, json, os, re, sys
from pptx import Presentation

HANGUL = re.compile(r"[가-힣]")
HAN = re.compile(r"[一-鿿]")
VERSE_LINE = re.compile(r"^(\d{1,3})\s+(.+)$")
REF_RE = re.compile(r"([가-힣]+)\s*(\d+):(\d+)(?:-+(\d+))?")
REF_ZH_RE = re.compile(r"([一-鿿]+)\s*(\d+):(\d+)(?:-+(\d+))?")
DATE_RE = re.compile(r"(\d{4})[.년]\s*(\d{1,2})[.월]\s*(\d{1,2})")

def script_of(line):
    k, h = len(HANGUL.findall(line)), len(HAN.findall(line))
    if k == 0 and h == 0:
        return "other"
    return "ko" if k >= h else "zh"

def slide_lines(slide):
    lines = []
    for sh in slide.shapes:
        if sh.has_text_frame:
            for p in sh.text_frame.paragraphs:
                # soft line breaks (<a:br>) arrive as "\n" inside one paragraph
                for sub in p.text.split("\n"):
                    lines.append(sub.strip())
        if getattr(sh, "has_table", False) and sh.has_table:
            for r in sh.table.rows:
                lines.append(" | ".join(c.text for c in r.cells).strip())
    return lines

def strip_creed(lines):
    """Every content slide carries the Apostles' Creed header in the master; drop it."""
    out, skip = [], False
    creed_markers = ("사도신경", "我信上帝", "전능하사 천지를", "我信我主耶稣", "그 외아들 우리 주",
                     "因圣灵感孕", "이는 성령으로 잉태하사", "使徒信经")
    for l in lines:
        if any(l.startswith(m) for m in creed_markers):
            continue
        out.append(l)
    return out

def join_block(lines, lang):
    """Re-flow hard-wrapped lines. Blank lines mark sub-paragraphs."""
    paras, cur = [], []
    for l in lines:
        if l == "":
            if cur:
                paras.append(cur); cur = []
        else:
            cur.append(l)
    if cur:
        paras.append(cur)
    sep = " " if lang == "ko" else ""
    joined = []
    for p in paras:
        text = sep.join(p)
        if lang == "zh":
            # Chinese decks were wrapped mid-sentence; remove stray spaces left after CJK punctuation
            text = re.sub(r"\s+(?=[一-鿿，。！？；：、“”（）])", "", text)
            text = re.sub(r"(?<=[一-鿿，。！？；：、“”（）])\s+", "", text)
        joined.append(text)
    return "\n".join(joined).strip()

def split_bilingual(lines):
    """Group a slide's lines into a ko block and a zh block (order-preserving)."""
    ko, zh = [], []
    for l in lines:
        s = script_of(l)
        if s == "ko":
            ko.append(l)
        elif s == "zh":
            zh.append(l)
        else:
            # blank / punctuation-only: attach to whichever block is currently open
            (zh if zh and (not ko or len(zh) >= 1 and script_of(next((x for x in reversed(lines[:lines.index(l)]) if x), "")) == "zh") else ko).append(l)
    return join_block(ko, "ko"), join_block(zh, "zh")

def parse_deck(path):
    prs = Presentation(path)
    slides = [strip_creed(slide_lines(s)) for s in prs.slides]
    raw = [[l for l in s if l] for s in slides]
    date = None
    m = re.search(r"(\d{8})", os.path.basename(path))
    if m:
        date = f"{m.group(1)[:4]}-{m.group(1)[4:6]}-{m.group(1)[6:]}"
    deck = {"source_file": os.path.basename(path), "date": date, "slides_total": len(slides)}

    # --- church name from slide 1
    first = raw[0] if raw else []
    deck["church"] = {"ko": next((l for l in first if script_of(l) == "ko" and "교회" in l), "새오름교회"),
                      "zh": next((l for l in first if script_of(l) == "zh" and "教会" in l), "言盐教会")}
    kids = any("유치부" in l for l in first)
    deck["kind"] = "kids" if kids else "adult"

    # --- scripture slides
    scripture = {"ref_ko": None, "ref_zh": None, "verses": []}
    verses = {}
    for i, s in enumerate(raw):
        text = "\n".join(s)
        if scripture["ref_ko"] is None and ("오늘의 말씀" in text or "성경봉독" in text):
            for l in s:
                mk = REF_RE.search(l)
                if mk and script_of(l) == "ko" and scripture["ref_ko"] is None:
                    scripture["ref_ko"] = l.strip()
                mz = REF_ZH_RE.search(l)
                if mz and script_of(l) == "zh" and scripture["ref_zh"] is None:
                    scripture["ref_zh"] = l.strip()
            if kids:
                # 성경봉독 slide: "마가복음 ⏎ 10장 13~16절"
                joined = " ".join(s).replace("~", "-")
                mk = re.search(r"([가-힣]+)\s*(\d+)장\s*(\d+)-(\d+)절", joined)
                if mk:
                    scripture["ref_ko"] = f"{mk.group(1)} {mk.group(2)}:{mk.group(3)}-{mk.group(4)}"
        carries_ref = scripture["ref_ko"] and any(
            (scripture["ref_ko"] and scripture["ref_ko"].replace("--", "-") in l.replace("--", "-").replace("~", "-"))
            or (scripture["ref_zh"] and scripture["ref_zh"] in l) for l in s)
        if kids and scripture["ref_ko"]:
            carries_ref = any("절" in l and "마가복음" in l for l in s) or any(re.match(r"^\d+절$", l) for l in s)
        if carries_ref:
            for l in s:
                mv = VERSE_LINE.match(l)
                if mv and not DATE_RE.search(l):
                    n, body = int(mv.group(1)), mv.group(2).strip()
                    lang = script_of(body)
                    if lang in ("ko", "zh"):
                        verses.setdefault(n, {})[lang] = body
            if kids:
                # "13절" heading followed by wrapped verse lines
                joined = s
                for j, l in enumerate(joined):
                    mk = re.match(r"^(\d+)절$", l)
                    if mk:
                        n = int(mk.group(1))
                        body = " ".join(x for x in joined[j + 1:] if not x.startswith("마가복음") and x != "아멘")
                        verses.setdefault(n, {})["ko"] = body
    scripture["verses"] = [{"n": n, "ko": v.get("ko", ""), "zh": v.get("zh", "")} for n, v in sorted(verses.items())]
    deck["scripture"] = scripture

    # --- hymns (lyric slides: 1–2 short lines, zh+ko pairs) — before the sermon
    hymns, seen = [], set()
    for s in raw:
        if 1 <= len(s) <= 2 and all(len(l) < 40 for l in s):
            zh = next((l for l in s if script_of(l) == "zh"), "")
            ko = next((l for l in s if script_of(l) == "ko"), "")
            if zh and ko and (zh, ko) not in seen and not VERSE_LINE.match(zh):
                seen.add((zh, ko)); hymns.append({"zh": zh, "ko": ko})
    deck["hymns"] = hymns

    # --- sermon title slide + body
    title_idx = None
    for i, s in enumerate(raw):
        text = "\n".join(s)
        if kids and ("이야기" in text and "절" in text):
            title_idx = i; break
        if "오늘의 말씀" in text and not REF_RE.search(text) and len(s) >= 2:
            title_idx = i; break
        if "본문:" in text or "经文：" in text:
            title_idx = i; break
    deck["title"] = {"ko": None, "zh": None}
    body, greeting = [], None
    if title_idx is not None:
        ts = [l for l in raw[title_idx] if l != "오늘의 말씀" and not DATE_RE.search(l)
              and "교회" not in l and "教会" not in l and "본문" not in l and "经文" not in l]
        ko_t = [l for l in ts if script_of(l) == "ko"]
        zh_t = [l for l in ts if script_of(l) == "zh"]
        if kids:
            ko_t = [l for l in ko_t if "이야기" not in l and "절" not in l]
            deck["title"]["ko"] = " ".join(ko_t[:2]).replace("  ", " ")
        else:
            deck["title"]["ko"] = ko_t[0] if ko_t else None
            deck["title"]["zh"] = zh_t[0] if zh_t else None
        # body: subsequent slides until the first empty slide (closing hymn follows)
        for i in range(title_idx + 1, len(slides)):
            s = slides[i]
            if not any(l for l in s):
                if body:
                    break
                continue
            if kids:
                lines = [l for l in s if l]
                body.append({"slide": i + 1, "ko": " / ".join(lines), "zh": "", "kids_block": lines})
                continue
            ko, zh = split_bilingual(s)
            if not ko and not zh:
                continue
            entry = {"slide": i + 1, "ko": ko, "zh": zh}
            if ko.startswith("“") and not body:
                entry["type"] = "passage"
            body.append(entry)
            if greeting is None and "인사" in ko and "“" in ko:
                gk = re.findall(r"“([^”]+)”", ko)
                gz = re.findall(r"“([^”]+)”", zh)
                if gk:
                    greeting = {"ko": gk, "zh": gz}
    deck["paragraphs"] = body
    deck["greeting"] = greeting
    return deck

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("pptx")
    ap.add_argument("-o", "--out")
    a = ap.parse_args()
    d = parse_deck(a.pptx)
    out = a.out or f"{d['date']}.raw.json"
    json.dump(d, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{out}: kind={d['kind']} title={d['title']} ref={d['scripture']['ref_ko']} / {d['scripture']['ref_zh']} "
          f"verses={len(d['scripture']['verses'])} paragraphs={len(d['paragraphs'])} hymns={len(d['hymns'])} greeting={d['greeting']}")
