#!/usr/bin/env python3
"""Share cards (카카오톡 · 인스타 공유용 이미지) for a sermon: 1080×1350 PNG (4:5) with the week's
greeting, the key verse and the title, in the same ink-navy/gold identity as the videos.
Also writes a 1200×630 OG image for link previews.

Usage: python3 pipeline/share_card.py data/sermons/2026-09-06.json
Output: data/cards/<id>.png, data/cards/<id>.og.png
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_video import font, wrap, draw_block, SANS_B, SANS_R, SERIF_B, SC, KR, BG, BG2, GOLD, IVORY, MUTED, ACCENT2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def ground(w, h):
    img = Image.new("RGB", (w, h), BG)
    glow = Image.new("RGB", (w, h), BG); gd = ImageDraw.Draw(glow)
    gd.ellipse((-w * 0.3, h * 0.25, w * 1.3, h * 0.85), fill=BG2)
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(w * 0.2)), 0.9)
    return img, ImageDraw.Draw(img)

def pick_verse(s):
    v = next((b for b in s["video"]["beats"] if b["kind"] == "verse"), None)
    if v: return v["zh"], v["ko"], v.get("pinyin", "")
    x = s["scripture"]["verses"][0]; return x["zh"], x["ko"], x.get("pinyin", "")

def card(s, out):
    W, H = 1080, 1350
    img, d = ground(W, H)
    d.text((72, 72), f"{s['church']['zh']}  ·  {s['church']['ko']}", font=font(SANS_R, 32, SC), fill=MUTED)
    ds = s["date"]; d.text((W - 72 - d.textlength(ds, font=font(SANS_R, 32, SC)), 72), ds, font=font(SANS_R, 32, SC), fill=MUTED)
    g = s.get("greeting")
    y = 200
    if g:
        lbl = "本周问候 · 이번 주 인사"; f = font(SANS_B, 34, SC); tw = d.textlength(lbl, font=f)
        d.rounded_rectangle((W / 2 - tw / 2 - 26, y, W / 2 + tw / 2 + 26, y + 64), radius=32, outline=GOLD, width=3)
        d.text((W / 2 - tw / 2, y + 9), lbl, font=f, fill=GOLD); y += 110
        y = draw_block(d, g["zh"][0], font(SERIF_B, 84 if len(g["zh"][0]) <= 12 else 68, SC), 80, y, W - 160, IVORY, cjk=True, spacing=1.3)
        y = draw_block(d, g["ko"][0], font(SANS_R, 42, KR), 100, y + 16, W - 200, MUTED, cjk=False)
        y += 70
    zh, ko, py = pick_verse(s)
    d.line((W / 2 - 70, y, W / 2 + 70, y), fill=GOLD, width=3); y += 50
    y = draw_block(d, zh, font(SANS_B, 52, SC), 90, y, W - 180, IVORY, cjk=True, spacing=1.45)
    y = draw_block(d, py, font(SANS_R, 30, SC), 90, y + 10, W - 180, GOLD, cjk=False, spacing=1.3)
    y = draw_block(d, ko, font(SANS_R, 36, KR), 110, y + 18, W - 220, MUTED, cjk=False, spacing=1.4)
    ref = f"{s['scripture']['ref_zh']}  ·  {s['scripture']['ref_ko']}"
    f = font(SANS_B, 34, SC); tw = d.textlength(ref, font=f)
    d.rounded_rectangle((W / 2 - tw / 2 - 30, y + 40, W / 2 + tw / 2 + 30, y + 104), radius=32, fill=(45, 58, 90))
    d.text((W / 2 - tw / 2, y + 52), ref, font=f, fill=GOLD)
    # footer: title + site
    ty = H - 230
    d.line((72, ty, W - 72, ty), fill=(55, 65, 90), width=2)
    draw_block(d, s["title"]["zh"], font(SERIF_B, 46, SC), 72, ty + 30, W - 144, IVORY, cjk=True, align="left")
    d.text((72, ty + 100), s["title"]["ko"], font=font(SANS_R, 32, KR), fill=MUTED)
    d.text((72, H - 70), "chinese-pastor.vercel.app  ·  讲道中文 · 설교로 배우는 중국어", font=font(SANS_R, 28, SC), fill=ACCENT2)
    img.save(out, optimize=True)

def og(s, out):
    W, H = 1200, 630
    img, d = ground(W, H)
    g = s.get("greeting"); line = g["zh"][0] if g else s["title"]["zh"]; sub = g["ko"][0] if g else s["title"]["ko"]
    d.text((60, 48), f"{s['church']['zh']} · {s['church']['ko']} · {s['date']}", font=font(SANS_R, 28, SC), fill=MUTED)
    y = draw_block(d, line, font(SERIF_B, 76 if len(line) <= 12 else 60, SC), 60, 150, W - 120, IVORY, cjk=True, spacing=1.25, align="left")
    draw_block(d, sub, font(SANS_R, 38, KR), 60, y + 14, W - 120, MUTED, cjk=False, align="left")
    d.text((60, H - 80), "讲道中文 · 설교로 배우는 중국어 — chinese-pastor.vercel.app", font=font(SANS_B, 30, SC), fill=GOLD)
    img.save(out, optimize=True)

if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "data", "cards"), exist_ok=True)
    for p in sys.argv[1:]:
        s = json.load(open(p, encoding="utf-8"))
        card(s, os.path.join(ROOT, "data", "cards", f"{s['id']}.png"))
        og(s, os.path.join(ROOT, "data", "cards", f"{s['id']}.og.png"))
        print("wrote data/cards/%s.png (+ .og.png)" % s["id"])
