"""Thin Gemini REST helpers (text JSON + TTS). Needs GEMINI_API_KEY."""
import base64, json, os, re, sys, time, urllib.request, urllib.error, wave

KEY = os.environ.get("GEMINI_API_KEY")
BASE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
TEXT_MODEL = os.environ.get("CP_TEXT_MODEL", "gemini-3.1-pro-preview")
TEXT_FALLBACK = "gemini-3.5-flash"
TTS_MODEL = os.environ.get("CP_TTS_MODEL", "gemini-2.5-flash-preview-tts")
CALLS = {"text": 0, "tts": 0}

def _post(model, body, timeout=300):
    if not KEY:
        sys.exit("GEMINI_API_KEY is not set — cannot enrich or narrate. Set it and re-run.")
    req = urllib.request.Request(BASE.format(model=model, key=KEY), data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    last = None
    for attempt in range(4):
        try:
            return json.load(urllib.request.urlopen(req, timeout=timeout))
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read()[:400]!r}"
            if e.code in (400, 404):
                raise RuntimeError(last)
        except Exception as e:  # timeouts, resets
            last = repr(e)
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"Gemini {model} failed after retries: {last}")

def generate_json(prompt, model=None, temperature=0.4, schema=None):
    """Ask for strict JSON; parse; fall back to flash on repeated failure."""
    model = model or TEXT_MODEL
    cfg = {"temperature": temperature, "responseMimeType": "application/json", "maxOutputTokens": 65536}
    if schema:
        cfg["responseSchema"] = schema
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": cfg}
    for m in (model, TEXT_FALLBACK):
        for attempt in range(2):
            CALLS["text"] += 1
            r = _post(m, body)
            try:
                text = r["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError):
                print("  unexpected response:", json.dumps(r)[:300], file=sys.stderr); continue
            text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
            try:
                return json.loads(text)
            except json.JSONDecodeError as e:
                print(f"  {m}: JSON parse failed ({e}); retrying", file=sys.stderr)
                open("/tmp/gemini_bad.json", "w").write(text)
    raise RuntimeError("Gemini returned unparseable JSON twice")

def tts(text, voice="Kore", out_wav=None, style=None):
    """Gemini TTS → 24 kHz mono 16-bit PCM. Returns (pcm_bytes, seconds)."""
    prompt = f"{style}: {text}" if style else text
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    CALLS["tts"] += 1
    r = _post(TTS_MODEL, body, timeout=180)
    part = r["candidates"][0]["content"]["parts"][0]["inlineData"]
    assert "rate=24000" in part["mimeType"], part["mimeType"]
    pcm = base64.b64decode(part["data"])
    if out_wav:
        with wave.open(out_wav, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
    return pcm, len(pcm) / 48000.0
