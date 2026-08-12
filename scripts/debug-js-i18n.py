#!/usr/bin/env python3
"""Debug + safe apply for one JS file."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZH = json.loads((ROOT / "lang" / "zh.json").read_text(encoding="utf-8"))
KEY_SET = {k for k in ZH if re.search(r"[\u4e00-\u9fff]", k) and len(k) <= 120}


def js_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def already_wrapped(src: str, start: int) -> bool:
    left = src[max(0, start - 40) : start]
    return bool(re.search(r"BTC\.t\s*\(\s*$", left))


def main() -> None:
    path = ROOT / sys.argv[1]
    write = "--write" in sys.argv
    src = path.read_text(encoding="utf-8")
    pattern = re.compile(r"""(['"])((?:\\.|[^\\])*?)\1""")
    matches = []
    cjk_not_key = []
    for m in pattern.finditer(src):
        body = m.group(2)
        raw = (
            body.replace("\\'", "'")
            .replace('\\"', '"')
            .replace("\\n", "\n")
            .replace("\\\\", "\\")
        )
        if not re.search(r"[\u4e00-\u9fff]", raw):
            continue
        if raw not in KEY_SET:
            if len(raw) < 80 and "<" not in raw:
                cjk_not_key.append(raw)
            continue
        if already_wrapped(src, m.start()):
            continue
        matches.append((m.start(), m.end(), raw, src[max(0, m.start() - 25) : m.start()]))
    print("matches", len(matches), "cjk_not_in_catalog", len(set(cjk_not_key)))
    for raw in sorted(set(cjk_not_key), key=len)[:30]:
        print("  missing key:", repr(raw))
    for start, end, raw, left in matches[:15]:
        print("  hit", repr(raw), "left", repr(left))
    if write and matches:
        chars = list(src)
        for start, end, raw, _ in sorted(matches, key=lambda x: -x[0]):
            chars[start:end] = list(f"BTC.t('{js_escape(raw)}')")
        path.write_text("".join(chars), encoding="utf-8")
        print("wrote", len(matches))


if __name__ == "__main__":
    main()
