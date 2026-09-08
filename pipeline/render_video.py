#!/usr/bin/env python3
"""Render a 9:16 sermon summary + vocabulary short from an enriched sermon JSON.

Beats: hook → title → summary×2 → points×3 → vocab×5 → verse → close.
Each beat = one designed card (Pillow) + Gemini TTS narration (Chinese).
Cards carry the Chinese line, pinyin and the Korean subtitle, so captions are
burned in by construction; an .srt/.vtt with the same timings is written too.

Usage: python3 pipeline/render_video.py data/sermons/2026-08-30.json [--voice Kore] [--no-tts] [--lang ko]
  --lang ko writes <id>.ko.mp4 with Korean narration (for Korean listeners who read the Chinese on screen).
  --target ko writes <id>.rev.mp4: the reverse video for Chinese speakers learning Korean — Korean on top,
  Chinese below, vocabulary from ko_vocab, Korean narration (add --lang zh for Chinese narration → .rev.zh.mp4).
Output: data/videos/<id>.mp4, <id>.vtt, <id>.srt, <id>.poster.jpg, <id>.script.json
Cost: ~14 Gemini TTS calls per sermon.
"""
import argparse, json, os, re, subprocess, sys, tempfile, wave, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gemini

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, FPS = 1080, 1920, 30
FONT_DIR = "/usr/share/fonts/opentype/noto"
SANS_B = os.path.join(FONT_DIR, "NotoSansCJK-Bold.ttc")
SANS_R = os.path.join(FONT_DIR, "NotoSansCJK-Regular.ttc")
SERIF_B = os.path.join(FONT_DIR, "NotoSerifCJK-Bold.ttc")
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = "ffmpeg"

# palette: deep navy ground, warm gold accent, soft ivory text
BG = (17, 24, 39); BG2 = (30, 41, 66); GOLD = (232, 180, 76); IVORY = (247, 243, 234)
MUTED = (170, 178, 196); ACCENT2 = (120, 190, 170)

_fonts = {}
def font(path, size, index=0):
    key = (path, size, index)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(path, size, index=index)  # index 2 = SC in the CJK ttc, 1 = KR
    return _fonts[key]
SC, KR = 2, 1  # face indices inside NotoSansCJK ttc: 0 JP,1 KR,2 SC,3 TC,4 HK

NO_START = "，。！？；：、”’）》」』…,.!?;:)"   # never start a line with these (kinsoku)
NO_END = "“‘（《「『("                        # never end a line with these

def _greedy(draw, units, fnt, max_w, cjk):
    lines, cur = [], ""
    for u in units:
        cand = cur + u if cjk else (cur + " " + u).strip()
        if draw.textlength(cand, font=fnt) <= max_w or not cur:
            cur = cand
        else:
            lines.append(cur); cur = u
    if cur:
        lines.append(cur)
    return lines

def wrap(draw, text, fnt, max_w, cjk):
    """Balanced wrap (like CSS text-wrap: balance) with CJK kinsoku rules.
    Per character for Chinese, per word for Korean/Latin. Lines come out of similar length,
    no line starts with closing punctuation, no line ends with an opening quote."""
    text = text.strip()
    if not text:
        return []
    units = list(text) if cjk else text.split(" ")
    lines = _greedy(draw, units, fnt, max_w, cjk)
    n = len(lines)
    if n > 1:
        # shrink the width until the line count would grow, so lines share the length evenly
        total = draw.textlength(text, font=fnt)
        lo, hi = total / n, max_w
        best = lines
        for _ in range(12):
            mid = (lo + hi) / 2
            cand = _greedy(draw, units, fnt, mid, cjk)
            if len(cand) <= n:
                best, hi = cand, mid
            else:
                lo = mid
        lines = best
    # kinsoku fix-ups (Chinese only): pull leading punctuation up, push trailing opening quotes down
    if cjk:
        changed = True
        while changed:
            changed = False
            for i in range(1, len(lines)):
                while lines[i] and lines[i][0] in NO_START:
                    lines[i - 1] += lines[i][0]; lines[i] = lines[i][1:]; changed = True
                while lines[i - 1] and lines[i - 1][-1] in NO_END:
                    lines[i] = lines[i - 1][-1] + lines[i]; lines[i - 1] = lines[i - 1][:-1]; changed = True
            lines = [l for l in lines if l]
    return lines

def draw_block(draw, text, fnt, x, y, max_w, fill, cjk, spacing=None, align="center"):
    """Draw wrapped text; returns the y just below the block. Line height defaults to a
    typographic value per script: 1.42 for Chinese, 1.5 for Korean/Latin."""
    lines = wrap(draw, text, fnt, max_w, cjk)
    if spacing is None:
        spacing = 1.42 if cjk else 1.5
    lh = int(fnt.size * spacing)
    for i, l in enumerate(lines):
        tw = draw.textlength(l, font=fnt)
        lx = x + (max_w - tw) / 2 if align == "center" else x
        draw.text((lx, y + i * lh), l, font=fnt, fill=fill)
    return y + len(lines) * lh

def base_card(sermon, progress, label=None):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # soft radial glow
    glow = Image.new("RGB", (W, H), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-300, 500, W + 300, 1500), fill=BG2)
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    img = Image.blend(img, glow, 0.9)
    d = ImageDraw.Draw(img)
    # header: church + date
    d.text((72, 96), sermon["church"]["zh"] + "  ·  " + sermon["church"]["ko"], font=font(SANS_R, 34, SC), fill=MUTED)
    d.text((W - 72 - d.textlength(sermon["date"], font=font(SANS_R, 34, SC)), 96), sermon["date"], font=font(SANS_R, 34, SC), fill=MUTED)
    if label:
        f = font(SANS_B, 38, SC)
        tw = d.textlength(label, font=f)
        d.rounded_rectangle((W / 2 - tw / 2 - 28, 190, W / 2 + tw / 2 + 28, 262), radius=36, outline=GOLD, width=3)
        d.text((W / 2 - tw / 2, 200), label, font=f, fill=GOLD)
    # progress bar
    d.text((72, H - 170), "讲道中文 · 설교로 배우는 중국어", font=font(SANS_R, 30, SC), fill=MUTED)
    d.rectangle((72, H - 112, W - 72, H - 104), fill=(55, 65, 90))
    d.rectangle((72, H - 112, 72 + (W - 144) * progress, H - 104), fill=GOLD)
    return img, ImageDraw.Draw(img)

CENTER_Y = 960  # vertical centre of the content area (between the label and the footer)
TARGET = "zh"   # "zh": Chinese is being learned (default). "ko": reverse video for Chinese speakers learning Korean.
def T(zh, ko):
    """(primary, secondary) text for the current TARGET."""
    return (zh, ko) if TARGET == "zh" else (ko, zh)
def PF():
    """(primary, secondary) font faces for the current TARGET."""
    return (SC, KR) if TARGET == "zh" else (KR, SC)

def card_text(sermon, beat, progress, label, number=None):
    img, d = base_card(sermon, progress, label)
    zh, ko = T(beat["zh"], beat["ko"]); pf, sf = PF()
    py = clean_pinyin(beat.get("pinyin", "")) if TARGET == "zh" else ""
    n = len(zh) if TARGET == "zh" else len(zh) * 0.6  # Korean is longer per idea; keep the big line readable
    size = 92 if n <= 14 else 78 if n <= 22 else 66
    def paint(dd, y0):
        y = y0
        if number is not None:
            f = font(SERIF_B, 150, SC)
            dd.text((W / 2 - dd.textlength(number, font=f) / 2, y), number, font=f, fill=GOLD); y += 210
        y = draw_block(dd, zh, font(SANS_B, size, pf), 90, y, W - 180, IVORY, cjk=(TARGET == "zh"), spacing=1.4)
        if py:
            y = draw_block(dd, py, font(SANS_R, 34, SC), 120, y + 18, W - 240, GOLD, cjk=False, spacing=1.55)
        y += 56
        dd.line((W / 2 - 56, y, W / 2 + 56, y), fill=GOLD, width=3)
        return draw_block(dd, ko, font(SANS_R, 44, sf), 120, y + 52, W - 240, MUTED, cjk=(TARGET == "ko"), spacing=1.55)
    y_end = paint(ImageDraw.Draw(Image.new("RGB", (W, H))), 0)   # measure
    paint(d, max(300, int(CENTER_Y - y_end / 2)))
    return img

def clean_pinyin(py):
    py = re.sub(r"\s*([，。！？；：、“”‘’（）…])\s*", lambda m: {"，": ", ", "。": ". ", "！": "! ", "？": "? ", "；": "; ", "：": ": ", "、": ", "}.get(m.group(1), ""), py)
    return re.sub(r"\s+", " ", py).strip()

def card_title(sermon, progress):
    img, d = base_card(sermon, progress, "本周讲道 · 이번 주 설교")
    prim, sec = T(sermon["title"]["zh"], sermon["title"]["ko"]); pf, sf = PF()
    y = draw_block(d, prim, font(SERIF_B if TARGET == "zh" else SANS_B, 96 if TARGET == "zh" else 78, pf), 90, 700, W - 180, IVORY, cjk=(TARGET == "zh"), spacing=1.32)
    y = draw_block(d, sec, font(SANS_R, 50, sf), 110, y + 36, W - 220, MUTED, cjk=(TARGET == "ko"))
    ref = sermon["scripture"]["ref_zh"] + "  ·  " + sermon["scripture"]["ref_ko"]
    f = font(SANS_B, 44, SC)
    tw = d.textlength(ref, font=f)
    d.rounded_rectangle((W / 2 - tw / 2 - 36, y + 90, W / 2 + tw / 2 + 36, y + 170), radius=40, fill=(45, 58, 90))
    d.text((W / 2 - tw / 2, y + 104), ref, font=f, fill=GOLD)
    return img

def card_vocab_ko(sermon, w, idx, progress):
    """Reverse video: a Korean word (ko_vocab) for Chinese speakers — Korean big, Chinese gloss, example in both."""
    img, d = base_card(sermon, progress, f"本周韩语单词 {idx}/5 · 이번 주 단어")
    ex_ko = (w.get("example_ko") or "").replace("...", "").strip("…. ")
    ex_zh = (w.get("example_zh") or "").replace("...", "").strip("…. ")
    def paint(dd, y0):
        f = font(SANS_B, 150 if len(w["ko"]) <= 4 else 110 if len(w["ko"]) <= 7 else 84, KR)
        dd.text((W / 2 - dd.textlength(w["ko"], font=f) / 2, y0), w["ko"], font=f, fill=IVORY)
        y = y0 + f.size + 60
        y = draw_block(dd, w["zh"], font(SANS_B, 68, SC), 90, y, W - 180, ACCENT2, cjk=True, spacing=1.4)
        if w.get("note_zh"):
            y = draw_block(dd, w["note_zh"], font(SANS_R, 32, SC), 130, y + 10, W - 260, MUTED, cjk=True)
        y += 76
        dd.line((W / 2 - 56, y, W / 2 + 56, y), fill=GOLD, width=3)
        y = draw_block(dd, ex_ko, font(SANS_R, 44, KR), 120, y + 52, W - 240, IVORY, cjk=False)
        return draw_block(dd, ex_zh, font(SANS_R, 36, SC), 130, y + 20, W - 260, MUTED, cjk=True)
    y_end = paint(ImageDraw.Draw(Image.new("RGB", (W, H))), 0)
    paint(d, max(300, int(CENTER_Y - y_end / 2)))
    return img

def card_vocab(sermon, w, idx, progress):
    img, d = base_card(sermon, progress, f"本周单词 {idx}/5 · 이번 주 단어")
    ex = w.get("example_zh", "").replace("...", "").strip("…. ")
    ex_ko = w.get("example_ko", "").replace("...", "").strip("…. ")
    def paint(dd, y0):
        f = font(SANS_B, 170 if len(w["zh"]) <= 3 else 130 if len(w["zh"]) <= 5 else 100, SC)
        dd.text((W / 2 - dd.textlength(w["zh"], font=f) / 2, y0), w["zh"], font=f, fill=IVORY)
        y = y0 + f.size + 56
        py = clean_pinyin(w["pinyin"]); f2 = font(SANS_R, 58, SC)
        dd.text((W / 2 - dd.textlength(py, font=f2) / 2, y), py, font=f2, fill=GOLD); y += 112
        y = draw_block(dd, w["ko"], font(SANS_B, 64, KR), 90, y, W - 180, ACCENT2, cjk=False, spacing=1.4)
        meta = f"{w.get('pos', '')}  ·  HSK {w.get('hsk', '')}"; f4 = font(SANS_R, 32, SC)
        dd.text((W / 2 - dd.textlength(meta, font=f4) / 2, y + 8), meta, font=f4, fill=MUTED)
        y += 118
        dd.line((W / 2 - 56, y, W / 2 + 56, y), fill=GOLD, width=3)
        y = draw_block(dd, ex, font(SANS_R, 44, SC), 120, y + 52, W - 240, IVORY, cjk=True)
        return draw_block(dd, ex_ko, font(SANS_R, 36, KR), 130, y + 20, W - 260, MUTED, cjk=False)
    y_end = paint(ImageDraw.Draw(Image.new("RGB", (W, H))), 0)
    paint(d, max(300, int(CENTER_Y - y_end / 2)))
    return img

KO_ORD = ["첫 번째", "두 번째", "세 번째", "네 번째", "다섯 번째"]
def build_beats(sermon, lang="zh"):
    """lang: 'zh' = Chinese narration (default), 'ko' = Korean narration for Korean listeners.
    Cards are identical in both; only the voice track changes."""
    if TARGET == "ko":
        return build_beats_reverse(sermon, lang)
    beats = []
    ai = sermon["video"]["beats"]
    by = {}
    for b in ai:
        by.setdefault(b["kind"], []).append(b)
    hook = by.get("hook", [None])[0]
    if hook:
        beats.append({"kind": "hook", "zh": hook["zh"], "ko": hook["ko"], "pinyin": hook.get("pinyin", ""), "label": "本周问候 · 이번 주 인사"})
    beats.append({"kind": "title", "zh": sermon["title"]["zh"], "ko": sermon["title"]["ko"],
                  "tts": (f"本周讲道：{sermon['title']['zh']}。经文：{sermon['scripture']['ref_zh']}。" if lang == "zh"
                          else f"이번 주 설교, {sermon['title']['ko']}. 본문은 {sermon['scripture']['ref_ko']}입니다.")})
    for b in by.get("summary", []):
        beats.append({"kind": "summary", "zh": b["zh"], "ko": b["ko"], "pinyin": b.get("pinyin", ""), "label": "核心信息 · 핵심 메시지"})
    for i, b in enumerate(by.get("point", [])[:3], 1):
        beats.append({"kind": "point", "zh": b["zh"], "ko": b["ko"], "pinyin": b.get("pinyin", ""), "label": "三个要点 · 세 가지 요점", "number": str(i)})
    vocab = [w for w in sermon["vocab"] if w.get("video")][:5] or sermon["vocab"][:5]
    for i, w in enumerate(vocab, 1):
        ex = w.get("example_zh", "").replace("...", "").strip("…. ")
        if lang == "zh":
            tts = f"第{'一二三四五'[i-1]}个词，{w['zh']}。{w['zh']}。{ex}"
        else:
            bridge = w.get("bridge") or {}
            hint = f" 한자로는 {bridge['ko_reading']}, 우리말 {bridge['ko_word']}." if bridge.get("relation") in ("same", "similar") and bridge.get("ko_reading") else ""
            tts = f"{KO_ORD[i-1]} 단어. {w['zh']}. 뜻은 {w['ko']}.{hint} {w['zh']}."
        beats.append({"kind": "vocab", "word": w, "idx": i, "zh": w["zh"], "ko": w["ko"], "pinyin": w["pinyin"], "tts": tts})
    for b in by.get("verse", [])[:1]:
        beats.append({"kind": "verse", "zh": b["zh"], "ko": b["ko"], "pinyin": b.get("pinyin", ""), "label": "本周金句 · 이번 주 말씀"})
    for b in by.get("close", [])[:1]:
        beats.append({"kind": "close", "zh": b["zh"], "ko": b["ko"], "pinyin": b.get("pinyin", ""), "label": "祝福 · 축복"})
    return beats

def build_beats_reverse(sermon, lang="ko"):
    """Korean is the target: same story beats, Korean primary; vocabulary from ko_vocab."""
    beats, by = [], {}
    for b in sermon["video"]["beats"]:
        by.setdefault(b["kind"], []).append(b)
    def mk(kind, b, label, **extra):
        return {"kind": kind, "zh": b["zh"], "ko": b["ko"], "pinyin": "", "label": label, **extra}
    hook = by.get("hook", [None])[0]
    if hook:
        beats.append(mk("hook", hook, "本周问候 · 이번 주 인사"))
    beats.append({"kind": "title", "zh": sermon["title"]["zh"], "ko": sermon["title"]["ko"],
                  "tts": (f"이번 주 설교, {sermon['title']['ko']}. 본문은 {sermon['scripture']['ref_ko']}입니다." if lang == "ko"
                          else f"本周讲道：{sermon['title']['zh']}。经文：{sermon['scripture']['ref_zh']}。")})
    for b in by.get("summary", []):
        beats.append(mk("summary", b, "核心信息 · 핵심 메시지"))
    for i, b in enumerate(by.get("point", [])[:3], 1):
        beats.append(mk("point", b, "三个要点 · 세 가지 요점", number=str(i)))
    for i, w in enumerate((sermon.get("ko_vocab") or [])[:5], 1):
        ex = (w.get("example_ko") or "").replace("...", "").strip("…. ")
        tts = (f"{KO_ORD[i-1]} 단어. {w['ko']}. {w['ko']}. {ex}" if lang == "ko"
               else f"第{'一二三四五'[i-1]}个词，{w['ko']}。意思是{w['zh']}。{w['ko']}。")
        beats.append({"kind": "vocab", "word": w, "idx": i, "zh": w["zh"], "ko": w["ko"], "pinyin": "", "tts": tts})
    for b in by.get("verse", [])[:1]:
        beats.append(mk("verse", b, "本周金句 · 이번 주 말씀"))
    for b in by.get("close", [])[:1]:
        beats.append(mk("close", b, "祝福 · 축복"))
    return beats

def wav_seconds(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()

def silent_wav(path, seconds):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(b"\x00\x00" * int(24000 * seconds))

def fmt_ts(t, vtt=False):
    h, m = divmod(int(t), 3600); m, s = divmod(m, 60); ms = int((t - int(t)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{'.' if vtt else ','}{ms:03d}"

import hashlib
CACHE = os.path.join(ROOT, "data", ".cache", "tts")

def tts_cached(text, voice, style, out_wav):
    """Gemini TTS with an on-disk cache so re-renders (typography fixes, new cards) cost no quota."""
    key = hashlib.sha1(f"{gemini.TTS_MODEL}|{voice}|{style}|{text}".encode()).hexdigest()
    os.makedirs(CACHE, exist_ok=True)
    cached = os.path.join(CACHE, key + ".wav")
    if not os.path.exists(cached):
        gemini.tts(text, voice=voice, out_wav=cached, style=style)
    import shutil; shutil.copy(cached, out_wav)

def reuse_audio(old_mp4, cue, out_wav):
    """Cut one beat's narration out of a previous render (its script.json gives the cue window)."""
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", f"{cue['start'] + 0.35:.3f}", "-t", f"{cue['end'] - cue['start'] - 1.05:.3f}",
                    "-i", old_mp4, "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", out_wav], check=True)

def render(sermon_path, voice="Kore", use_tts=True, out_dir=None, lang="zh", target="zh", reuse=False):
    global TARGET
    TARGET = target
    sermon = json.load(open(sermon_path, encoding="utf-8"))
    sid = sermon["id"]
    out_dir = out_dir or os.path.join(ROOT, "data", "videos")
    os.makedirs(out_dir, exist_ok=True)
    beats = build_beats(sermon, lang)
    tmp = tempfile.mkdtemp(prefix=f"cp-{sid}-{lang}-")
    style = ("请用温暖、清晰、稍慢的语速朗读下面的中文，只朗读文本本身" if lang == "zh"
             else "다음 문장을 따뜻하고 또렷하게, 조금 천천히 한국어로 읽어 주세요. 중국어 단어는 중국어로 정확히 발음하세요. 이 지시문은 읽지 마세요")
    suffix = ("" if lang == "zh" else f".{lang}") if target == "zh" else (".rev" if lang == "ko" else ".rev.zh")
    old_script = os.path.join(out_dir, f"{sid}{suffix}.script.json"); old_mp4 = os.path.join(out_dir, f"{sid}{suffix}.mp4")
    old = json.load(open(old_script)) if reuse and os.path.exists(old_script) and os.path.exists(old_mp4) else None
    if reuse and not old:
        print("  no previous render to reuse audio from; falling back to TTS", file=sys.stderr)
    if old:
        import shutil; shutil.copy(old_mp4, old_mp4 + ".prev")  # keep the source of the audio until we are done
        old_mp4 = old_mp4 + ".prev"
    clips, cues, t = [], [], 0.0
    for i, b in enumerate(beats):
        progress = (i + 1) / len(beats)
        if b["kind"] == "title":
            img = card_title(sermon, progress)
        elif b["kind"] == "vocab":
            img = (card_vocab if TARGET == "zh" else card_vocab_ko)(sermon, b["word"], b["idx"], progress)
        else:
            img = card_text(sermon, b, progress, b.get("label"), b.get("number"))
        png = os.path.join(tmp, f"{i:02d}.png"); img.save(png)
        wav = os.path.join(tmp, f"{i:02d}.wav")
        text = b.get("tts") or (b["zh"] if lang == "zh" else b["ko"])
        if old and i < len(old["cues"]) and old["cues"][i]["kind"] == b["kind"]:
            reuse_audio(old_mp4, old["cues"][i], wav); dur = wav_seconds(wav)
        elif use_tts:
            tts_cached(text, voice, style, wav)
            dur = wav_seconds(wav)
        else:
            dur = max(2.5, len(text) * 0.22); silent_wav(wav, dur)
        pad_in, pad_out = 0.35, 0.7
        total = pad_in + dur + pad_out
        clip = os.path.join(tmp, f"{i:02d}.mp4")
        # slow push-in so a static card still reads as motion; fade edges; pad the narration
        vf = (f"scale=1296:2304,zoompan=z='min(1.0+0.0018*on,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
              f":d={int(total*FPS)}:s={W}x{H}:fps={FPS},fade=t=in:st=0:d=0.3,fade=t=out:st={total-0.3:.2f}:d=0.3,format=yuv420p")
        af = f"adelay={int(pad_in*1000)}|{int(pad_in*1000)},apad=pad_dur={pad_out},aresample=44100"
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-loop", "1", "-i", png, "-i", wav,
                        "-vf", vf, "-af", af, "-t", f"{total:.3f}", "-r", str(FPS),
                        "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "128k", "-shortest", clip], check=True)
        clips.append(clip)
        cues.append({"start": round(t, 3), "end": round(t + total, 3), "kind": b["kind"], "zh": b["zh"], "ko": b["ko"], "pinyin": b.get("pinyin", "")})
        t += total
        print(f"  beat {i+1}/{len(beats)} {b['kind']:8s} {dur:5.1f}s  {b['zh'][:30]}", file=sys.stderr)
    lst = os.path.join(tmp, "list.txt")
    open(lst, "w").write("".join(f"file '{c}'\n" for c in clips))
    mp4 = os.path.join(out_dir, f"{sid}{suffix}.mp4")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst,
                    "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    "-c:a", "aac", "-b:a", "128k", mp4], check=True)
    if old:
        os.remove(old_mp4)
    # poster = the title card
    Image.open(os.path.join(tmp, "01.png")).convert("RGB").resize((540, 960)).save(os.path.join(out_dir, f"{sid}{suffix}.poster.jpg"), quality=82)
    with open(os.path.join(out_dir, f"{sid}{suffix}.vtt"), "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for c in cues:
            f.write(f"{fmt_ts(c['start'], True)} --> {fmt_ts(c['end'], True)}\n{c['zh']}\n{c['ko']}\n\n")
    with open(os.path.join(out_dir, f"{sid}{suffix}.srt"), "w", encoding="utf-8") as f:
        for n, c in enumerate(cues, 1):
            f.write(f"{n}\n{fmt_ts(c['start'])} --> {fmt_ts(c['end'])}\n{c['zh']}\n{c['ko']}\n\n")
    json.dump({"id": sid, "lang": lang, "target": target, "duration": round(t, 2), "voice": voice, "tts_model": gemini.TTS_MODEL, "cues": cues},
              open(os.path.join(out_dir, f"{sid}{suffix}.script.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"wrote {mp4} ({t:.1f}s, {os.path.getsize(mp4)/1e6:.1f} MB) tts_calls={gemini.CALLS['tts']}", file=sys.stderr)
    return mp4

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("sermon"); ap.add_argument("--voice", default="Kore"); ap.add_argument("--no-tts", action="store_true")
    ap.add_argument("--out-dir")
    ap.add_argument("--lang", default=None, choices=["zh", "ko"], help="narration language (default: same as --target)")
    ap.add_argument("--target", default="zh", choices=["zh", "ko"], help="language being learned: zh (default) or ko (reverse video for Chinese speakers)")
    ap.add_argument("--reuse-audio", action="store_true", help="re-draw the cards but take the narration from the previous render of the same variant (no TTS calls)")
    a = ap.parse_args()
    render(a.sermon, a.voice, not a.no_tts, a.out_dir, a.lang or a.target, a.target, a.reuse_audio)
