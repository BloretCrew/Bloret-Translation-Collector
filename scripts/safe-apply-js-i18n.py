#!/usr/bin/env python3
"""
Safely wrap whole JS string literals that equal a known i18n key with BTC.t('key').
Never does substring replace — avoids corrupting toast(\"success\", ...).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZH = json.loads((ROOT / "lang" / "zh.json").read_text(encoding="utf-8"))
KEYS = sorted(
    [k for k in ZH if re.search(r"[\u4e00-\u9fff]", k) and len(k) <= 120],
    key=len,
    reverse=True,
)
KEY_SET = set(KEYS)


def js_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def already_wrapped(src: str, start: int) -> bool:
    left = src[max(0, start - 40) : start]
    return bool(re.search(r"BTC\.t\s*\(\s*$", left))


def process(path: Path) -> int:
    src = path.read_text(encoding="utf-8")
    # whole quoted strings only
    pattern = re.compile(r"""(['"])((?:\\.|[^\\])*?)\1""")
    matches: list[tuple[int, int, str]] = []
    for m in pattern.finditer(src):
        body = m.group(2)
        raw = (
            body.replace("\\'", "'")
            .replace('\\"', '"')
            .replace("\\n", "\n")
            .replace("\\\\", "\\")
        )
        if raw not in KEY_SET:
            continue
        if already_wrapped(src, m.start()):
            continue
        matches.append((m.start(), m.end(), raw))
    if not matches:
        return 0
    chars = list(src)
    for start, end, raw in sorted(matches, key=lambda x: -x[0]):
        chars[start:end] = list(f"BTC.t('{js_escape(raw)}')")
    path.write_text("".join(chars), encoding="utf-8")
    return len(matches)


def main() -> None:
    total = 0
    for p in sorted((ROOT / "public" / "js").glob("*.js")):
        n = process(p)
        total += n
        print(f"{p.name}: {n}")
    print("total", total)


if __name__ == "__main__":
    main()
