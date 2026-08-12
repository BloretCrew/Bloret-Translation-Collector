#!/usr/bin/env python3
"""Machine-translate lang/zh.json -> lang/en.json via Google gtx (best-effort)."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
zh = json.loads((ROOT / "lang" / "zh.json").read_text(encoding="utf-8"))
en_path = ROOT / "lang" / "en.json"
en = json.loads(en_path.read_text(encoding="utf-8")) if en_path.exists() else {}
cache_path = ROOT / "lang" / ".en-cache.json"
cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
cjk = re.compile(r"[\u4e00-\u9fff]")


def translate(text: str) -> str:
    if not text or not cjk.search(text):
        return text
    if text in cache:
        return cache[text]
    url = (
        "https://translate.googleapis.com/translate_a/single"
        f"?client=gtx&sl=zh-CN&tl=en&dt=t&q={urllib.parse.quote(text)}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.loads(r.read().decode())
            parts = []
            if data and data[0]:
                for seg in data[0]:
                    if seg and seg[0]:
                        parts.append(seg[0])
            out = "".join(parts) if parts else text
            cache[text] = out
            return out
        except Exception as e:
            time.sleep(0.6 * (attempt + 1))
            last = e
    print("FAIL", text[:40], last)
    return text


def main() -> None:
    keys = list(zh.keys())
    print("keys", len(keys))
    start = time.time()
    for i, k in enumerate(keys):
        cur = en.get(k)
        # skip if already real English (no cjk)
        if isinstance(cur, str) and cur and not cjk.search(cur) and cur != k:
            continue
        # identity chinese still needs translate
        en[k] = translate(k)
        if (i + 1) % 40 == 0:
            cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            rate = (i + 1) / max(time.time() - start, 0.1)
            print(f"{i+1}/{len(keys)} {rate:.1f}/s last={en[k][:50]!r}")
        time.sleep(0.04)
    # keep key order of zh
    ordered = {k: en.get(k, k) for k in keys}
    en_path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print("wrote", en_path, "elapsed", round(time.time() - start, 1))


if __name__ == "__main__":
    main()
