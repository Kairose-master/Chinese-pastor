#!/usr/bin/env python3
"""Add a 한자어 다리 (hanja bridge) to every vocabulary word: the Korean Sino reading of the
same characters, the everyday Korean word that corresponds, and how close they are.
Koreans already know half of Chinese vocabulary through 한자어 — this makes that visible.

Usage: python3 pipeline/hanja_bridge.py data/sermons/*.json   (one Gemini call per file, skips words already bridged)
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gemini

PROMPT = """你是精通中文与韩语汉字词（한자어）的语言教师。下面是若干中文词语。请为每个词做「汉字词桥接」，帮助韩国人借助自己已知的한자어学中文。
对每个词输出 JSON 对象：
- "zh": 原词（原样返回）
- "hanja": 该词的繁体/韩国汉字写法（如 差遣→差遣，恩典→恩典，礼拜→禮拜，预备→豫備/預備）
- "ko_reading": 用韩语汉字音读出来的读法（如 差遣→차견，礼拜→예배，预备→예비）
- "ko_word": 韩语里对应的日常词（含汉字），若对应词就是同一汉字词则写同一个（如 礼拜→예배(禮拜)；差遣→파송(派送)；恩典→은혜(恩惠)）
- "relation": 四选一 —— "same"（同一汉字词，韩语也常用这样说）/ "similar"（汉字部分相同或意思相近，韩语说法略不同）/ "different"（意思相同但汉字完全不同）/ "none"（韩语没有对应汉字词，或该词不是汉字词，如口语词、虚词）
- "note_ko": 一句韩语说明（≤ 40 字），点出记忆抓手，例如「‘예배(禮拜)’와 같은 한자, 简体만 다름」「한국어 ‘파송’과 뜻은 같지만 글자가 다름」
只输出 JSON 数组，顺序与输入相同。

词语：
{words}
"""

def bridge(path):
    d = json.load(open(path, encoding="utf-8"))
    todo = [w for w in d.get("vocab", []) if not w.get("bridge")]
    if not todo:
        print(f"{path}: already bridged"); return
    words = "\n".join(f"{i+1}. {w['zh']}（{w.get('ko','')}）" for i, w in enumerate(todo))
    res = gemini.generate_json(PROMPT.replace("{words}", words), temperature=0.2)
    if isinstance(res, dict):
        res = res.get("items") or res.get("words") or list(res.values())[0]
    by = {r["zh"]: r for r in res if isinstance(r, dict) and "zh" in r}
    n = 0
    for w in todo:
        r = by.get(w["zh"])
        if r:
            w["bridge"] = {k: r.get(k, "") for k in ("hanja", "ko_reading", "ko_word", "relation", "note_ko")}; n += 1
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{path}: bridged {n}/{len(todo)}")

if __name__ == "__main__":
    for p in sys.argv[1:]:
        bridge(p)
