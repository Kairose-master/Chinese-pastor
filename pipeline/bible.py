#!/usr/bin/env python3
"""Fetch Bible passages from bolls.life (CUNPS = 和合本 simplified, KRV = 개역한글)
and cache them under data/bible/<translation>/<book>.<chapter>.json.

Usage:
  python3 pipeline/bible.py "使徒行传 1:12-14"   # any ref in the REFS list format
  python3 pipeline/bible.py --all                # fetch every ref used by the site
"""
import json, os, re, sys, time, urllib.request, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "data", "bible")
API = "https://bolls.life/get-text/{tr}/{book}/{chapter}/"

# Book numbers (bolls uses the Protestant 66-book order).
BOOKS = {
    "创世记": 1, "出埃及记": 2, "诗篇": 19, "以赛亚书": 23, "耶利米书": 24, "但以理书": 27,
    "哈巴谷书": 35, "马太福音": 40, "马可福音": 41, "路加福音": 42, "约翰福音": 43,
    "使徒行传": 44, "罗马书": 45, "哥林多前书": 46, "哥林多后书": 47, "加拉太书": 48,
    "以弗所书": 49, "腓立比书": 50, "歌罗西书": 51, "提摩太前书": 54, "提摩太后书": 55,
    "希伯来书": 58, "雅各书": 59, "彼得前书": 60, "约翰一书": 62, "启示录": 66,
}
KO_NAMES = {
    "创世记": "창세기", "出埃及记": "출애굽기", "诗篇": "시편", "以赛亚书": "이사야", "耶利米书": "예레미야",
    "但以理书": "다니엘", "哈巴谷书": "하박국", "马太福音": "마태복음", "马可福音": "마가복음",
    "路加福音": "누가복음", "约翰福音": "요한복음", "使徒行传": "사도행전", "罗马书": "로마서",
    "哥林多前书": "고린도전서", "哥林多后书": "고린도후서", "加拉太书": "갈라디아서", "以弗所书": "에베소서",
    "腓立比书": "빌립보서", "歌罗西书": "골로새서", "提摩太前书": "디모데전서", "提摩太后书": "디모데후서",
    "希伯来书": "히브리서", "雅各书": "야고보서", "彼得前书": "베드로전서", "约翰一书": "요한일서", "启示录": "요한계시록",
}
TRANSLATIONS = {"zh": "CUNPS", "ko": "KRV"}

TAG_RE = re.compile(r"<[^>]+>")

def clean(text):
    # bolls marks proper nouns with <e>…</e> and notes with <sup>…</sup>
    text = re.sub(r"<sup>.*?</sup>", "", text)
    text = TAG_RE.sub("", text)
    return html.unescape(text).strip()

def parse_ref(ref):
    m = re.match(r"^(\S+?)\s*(\d+):(\d+)(?:-(\d+))?$", ref.strip())
    if not m:
        raise ValueError(f"bad ref: {ref}")
    book, ch, v1, v2 = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
    return book, ch, v1, int(v2) if v2 else v1

def fetch_chapter(tr, book_no, chapter):
    path = os.path.join(CACHE, tr, f"{book_no}.{chapter}.json")
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    req = urllib.request.Request(API.format(tr=tr, book=book_no, chapter=chapter),
                                 headers={"User-Agent": "chinese-pastor/1.0"})
    for attempt in range(4):
        try:
            data = json.load(urllib.request.urlopen(req, timeout=30))
            break
        except Exception as e:  # network hiccup: back off
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    verses = {str(v["verse"]): clean(v["text"]) for v in data}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(verses, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    time.sleep(0.4)  # be polite
    return verses

def passage(ref):
    """Return {ref, ref_ko, book, chapter, verses:[{n, zh, ko}]}"""
    book, ch, v1, v2 = parse_ref(ref)
    no = BOOKS[book]
    zh = fetch_chapter(TRANSLATIONS["zh"], no, ch)
    ko = fetch_chapter(TRANSLATIONS["ko"], no, ch)
    verses = [{"n": n, "zh": zh.get(str(n), ""), "ko": ko.get(str(n), "")} for n in range(v1, v2 + 1)]
    rng = f"{v1}" if v1 == v2 else f"{v1}-{v2}"
    return {"ref": f"{book} {ch}:{rng}", "ref_ko": f"{KO_NAMES[book]} {ch}:{rng}",
            "book": book, "chapter": ch, "verses": verses,
            "source": {"zh": "和合本 (CUNPS, bolls.life)", "ko": "개역한글 (KRV, bolls.life)"}}

REFS = [
    "罗马书 8:35-39", "哈巴谷书 3:17-18", "马可福音 10:13-16", "使徒行传 1:12-14",
    "哥林多前书 3:6-9", "使徒行传 13:1-3",
    # verses quoted inside the sermons
    "提摩太后书 4:9-18", "但以理书 3:17-18", "雅各书 2:19", "约翰福音 20:31", "以弗所书 2:13",
    "诗篇 44:22", "使徒行传 1:4", "使徒行传 1:8", "希伯来书 11:1", "约翰福音 6:68",
    "使徒行传 11:19-26", "使徒行传 14:26", "使徒行传 16:14", "提摩太前书 2:5", "约翰福音 3:36",
    "使徒行传 4:12", "罗马书 3:22",
]

if __name__ == "__main__":
    args = sys.argv[1:]
    refs = REFS if args == ["--all"] else args
    out = {}
    for r in refs:
        p = passage(r)
        out[p["ref"]] = p
        for v in p["verses"]:
            print(f"{p['ref']} v{v['n']}\n  zh: {v['zh']}\n  ko: {v['ko']}")
    json.dump(out, open(os.path.join(CACHE, "passages.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("wrote", os.path.join(CACHE, "passages.json"))
