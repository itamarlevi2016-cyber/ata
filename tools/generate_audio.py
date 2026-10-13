#!/usr/bin/env python3
"""יוצר הקלטות קול אנושיות (mp3) לכל שלבי הקורס, בקול עברי עצבי (נוירלי).

שימוש:
    python tools/generate_audio.py            # יוצר רק מה שחסר או השתנה
    python tools/generate_audio.py --force    # יוצר הכול מחדש
    python tools/generate_audio.py --dry-run  # רק מציג מה היה נוצר

מנוע הקול:
  * אם מוגדרים AZURE_SPEECH_KEY ו-AZURE_SPEECH_REGION: שירות Azure Speech הרשמי (מומלץ לאתר ציבורי).
  * אחרת: edge-tts (pip install edge-tts), שירות הקראה חינמי של Microsoft Edge שאינו API רשמי.
קול ברירת המחדל: he-IL-AvriNeural (גברי). אפשר לשנות עם המשתנה TTS_VOICE.
"""
import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
VOICE = os.environ.get("TTS_VOICE", "he-IL-AvriNeural")
RATE = os.environ.get("TTS_RATE", "-6%")  # קצב רגוע יותר, מתאים להדרכה


def load_items():
    out = subprocess.run(["node", str(ROOT / "tools" / "export-narration.mjs")], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def synth_azure(text, path):
    key, region = os.environ["AZURE_SPEECH_KEY"], os.environ["AZURE_SPEECH_REGION"]
    esc = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    ssml = f"<speak version='1.0' xml:lang='he-IL'><voice name='{VOICE}'><prosody rate='{RATE}'>{esc}</prosody></voice></speak>"
    req = urllib.request.Request(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        data=ssml.encode("utf-8"),
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml; charset=utf-8",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "User-Agent": "kol-bothe",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        path.write_bytes(r.read())


def synth_edge(text, path):
    import edge_tts

    async def run():
        await asyncio.wait_for(edge_tts.Communicate(text, VOICE, rate=RATE).save(str(path)), timeout=45)

    asyncio.run(run())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    items = load_items()
    AUDIO.mkdir(exist_ok=True)
    manifest_path = AUDIO / "manifest.json"
    old = json.loads(manifest_path.read_text("utf-8")) if manifest_path.exists() else {"items": {}}
    new_items, todo = {}, []
    for it in items:
        f = AUDIO / f"{it['key']}.mp3"
        prev = old.get("items", {}).get(it["key"])
        if not args.force and prev and prev["hash"] == it["hash"] and prev.get("voice") == VOICE and f.exists():
            new_items[it["key"]] = prev
        else:
            todo.append(it)
    print(f"{len(items)} שלבים, {len(todo)} להקלטה, {len(items) - len(todo)} כבר מעודכנים")
    if args.dry_run:
        for it in todo:
            print("-", it["key"], it["text"][:60])
        return

    synth = synth_azure if os.environ.get("AZURE_SPEECH_KEY") else synth_edge
    print("מנוע:", "Azure Speech" if synth is synth_azure else "edge-tts", "| קול:", VOICE)
    failed = 0
    streak = 0  # כשלים רצופים: אם השירות לא נגיש, עוצרים מהר במקום להמתין בלי סוף
    for n, it in enumerate(todo, 1):
        f = AUDIO / f"{it['key']}.mp3"
        for attempt in range(1, 4):
            try:
                synth(it["text"], f)
                if f.stat().st_size < 1000:
                    raise RuntimeError("הקובץ ריק")
                new_items[it["key"]] = {"hash": it["hash"], "voice": VOICE, "bytes": f.stat().st_size}
                print(f"[{n}/{len(todo)}] {it['key']} ✓")
                streak = 0
                break
            except Exception as e:  # noqa: BLE001
                print(f"[{n}/{len(todo)}] {it['key']} ניסיון {attempt} נכשל: {e}", file=sys.stderr)
                time.sleep(2 * attempt)
        else:
            failed += 1
            streak += 1
            f.unlink(missing_ok=True)
            if streak >= 3:
                print("שירות ההקראה לא נגיש: 3 כשלים רצופים. עוצרים. אפשר להגדיר AZURE_SPEECH_KEY ו-AZURE_SPEECH_REGION.", file=sys.stderr)
                break
        time.sleep(0.3)

    # מוחקים הקלטות של שלבים שכבר לא קיימים
    keep = {f"{k}.mp3" for k in new_items}
    for f in AUDIO.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()
    manifest_path.write_text(json.dumps({"voice": VOICE, "items": new_items}, ensure_ascii=False, indent=1), "utf-8")
    print(f"סיום. נכשלו: {failed}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
