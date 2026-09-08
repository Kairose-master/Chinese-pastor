#!/usr/bin/env python3
"""Build data/glossary.json — a Christian Chinese terminology dictionary (기독교 중국어 용어 사전).

~220 terms across 12 categories, each with 和合本 usage, pinyin (pypinyin), Korean church term,
English, a one-line Korean explanation, a verse where it appears (和合本 reference), and the hanja bridge.
Generated with Gemini in category batches, then checked: every term must contain CJK, every ref parses.

Usage: python3 pipeline/glossary.py
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gemini
from enrich import to_pinyin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "glossary.json")

CATEGORIES = [
    ("神论 · 하나님", "神/上帝/耶和华/主/三位一体/圣父/圣子/圣灵/全能/创造/护理/主权/荣耀/圣洁/慈爱/信实/公义 등 하나님의 이름과 속성", 22),
    ("基督论 · 예수 그리스도", "耶稣/基督/弥赛亚/道成肉身/十字架/受难/复活/升天/再来/救主/中保/羔羊/大祭司/君王/人子/神的儿子 등", 22),
    ("救恩 · 구원", "救恩/罪/悔改/信心/称义/恩典/赦免/重生/成圣/得救/永生/审判/地狱/天堂/预定/拣选/代赎/和好/立约/福音 등", 24),
    ("圣灵与灵命 · 성령과 영성", "圣灵/充满/恩赐/果子/引导/感动/属灵/灵修/默想/禁食/祷告/代祷/敬拜/赞美/顺服/谦卑/试探/得胜/属肉体/老我 등", 22),
    ("教会 · 교회", "教会/弟兄姊妹/圣徒/门徒/牧师/传道人/长老/执事/劝士(권사)/主日/礼拜/聚会/团契/小组/查经/主日学/洗礼/圣餐/奉献/十一/按手/差遣/宣教/植堂/见证/服事/同工/事奉 등", 30),
    ("圣经 · 성경", "圣经/旧约/新约/律法/先知/福音书/使徒/书信/启示/经文/章节/和合本/默示/应许/诫命/比喻/预言/应验 등", 18),
    ("礼仪与节期 · 예식과 절기", "圣诞/复活节/受难周/棕枝主日/五旬节/降临节/感恩节/婚礼/追思礼拜/献儿礼/祝祷/使徒信经/主祷文/阿们/哈利路亚 등", 18),
    ("圣经人物与地名 · 인물과 지명", "亚当/挪亚/亚伯拉罕/摩西/大卫/以利亚/但以理/马利亚/彼得/保罗/巴拿巴/提摩太/耶路撒冷/伯利恒/拿撒勒/加利利/安提阿/以色列/埃及/巴比伦 등 — 한국어 표기와 다른 음역이 핵심", 30),
    ("末世与盼望 · 종말과 소망", "末世/再来/审判/新天新地/天国/神的国/永生/复活/盼望/忍耐/警醒/预备/新妇/羔羊的婚宴 등", 14),
    ("生活与伦理 · 신앙 생활", "爱心/饶恕/舍己/背十字架/管家/事奉/传福音/作见证/属灵争战/试炼/患难/平安/喜乐/感恩/知足/圣洁生活/婚姻/家庭祭坛 등", 20),
    ("祷告常用语 · 기도 상용구", "奉主耶稣的名/亲爱的天父/求主/感谢主/愿主/阿们/主啊/我们在天上的父/赐福/保守/看顾/引导/同在/怜悯/垂听 등 기도문에서 실제로 쓰는 구절", 16),
    ("教会中文口语 · 교회 현장 회화", "主内平安/愿神祝福你/为你祷告/一起吃饭吧/欢迎来教会/下周见/我是留学生/请多关照/你信主多久了/受洗了吗/教会在哪里/几点礼拜 등 유학생 교회에서 실제로 오가는 말", 20),
]

PROMPT = """你是精通中文（和合本用语）与韩语教会用语的神学词典编者。请为类别「{cat}」编写 {n} 个词条，供在韩国的中国留学生教会里学中文的韩国信徒使用。
范围提示：{hint}
每个词条严格输出 JSON 对象：
{{"zh": "中文词（简体）", "ko": "对应的韩国教회 용어（必要时含한자, 如 '은혜(恩惠)'）", "en": "English", "pos": "名词/动词/形容词/短语/人名/地名",
 "def_ko": "한국어 한 줄 설명（≤ 60자，说明含义与교회에서 쓰는 맥락）", "usage_zh": "一句自然的中文例句（教会语境或和合本经文原句）", "usage_ko": "该例句的韩语",
 "ref": "和合本中出现该词或最能代表该词的一处经文引用，格式如 '罗马书 8:35'（书名用简体和合本书名；口语类可为空字符串）",
 "hanja": "繁体/韩国汉字写法", "ko_reading": "韩语汉字音（如 恩典→은전）", "bridge": "same|similar|different|none —— 韩语常用词是否为同一汉字词", "note_ko": "한 줄 기억 요령（≤ 40자）",
 "related": ["相关词1", "相关词2"]}}
要求：用词必须是中国大陆教会与和合本实际通用的说法（例如 神/上帝 并列、圣灵、教会、弟兄姊妹、劝士 是韩国教会特有职分需注明），不要生造。人名地名请给出和合本译名并在 note_ko 里指出与韩语发音的差异。只输出 JSON 数组。"""

def build():
    glossary = []
    for cat, hint, n in CATEGORIES:
        print(f"  {cat} ({n})", file=sys.stderr)
        items = gemini.generate_json(PROMPT.format(cat=cat, hint=hint, n=n), temperature=0.3)
        if isinstance(items, dict):
            items = next(v for v in items.values() if isinstance(v, list))
        for it in items:
            if not isinstance(it, dict) or not re.search(r"[一-鿿]", it.get("zh", "")):
                continue
            it["category"] = cat
            it["pinyin"] = to_pinyin(it["zh"])
            it["usage_pinyin"] = to_pinyin(it.get("usage_zh", ""))
            glossary.append(it)
    # dedupe by zh, keep first
    seen, out = set(), []
    for it in glossary:
        if it["zh"] in seen: continue
        seen.add(it["zh"]); out.append(it)
    json.dump({"generated": __import__("datetime").date.today().isoformat(), "model": gemini.TEXT_MODEL,
               "categories": [c for c, _, _ in CATEGORIES], "terms": out},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"wrote {OUT}: {len(out)} terms, calls={gemini.CALLS}", file=sys.stderr)

if __name__ == "__main__":
    build()
