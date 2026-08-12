#!/usr/bin/env python3
"""Wrap remaining bare Chinese quotes in public/js even if not yet in catalog."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS_DIR = ROOT / "public" / "js"
zh_path = ROOT / "lang" / "zh.json"
zh = json.loads(zh_path.read_text(encoding="utf-8"))
cjk = re.compile(r"[\u4e00-\u9fff]")


def js_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def already(src: str, start: int) -> bool:
    left = src[max(0, start - 50) : start]
    return bool(re.search(r"BTC\.t\s*\(\s*$", left))


def process(path: Path) -> tuple[int, list[str]]:
    src = path.read_text(encoding="utf-8")
    pattern = re.compile(r"""(['"])((?:\\.|[^\\])*?)\1""")
    matches = []
    new_keys = []
    for m in pattern.finditer(src):
        body = m.group(2)
        raw = (
            body.replace("\\'", "'")
            .replace('\\"', '"')
            .replace("\\n", "\n")
            .replace("\\\\", "\\")
        )
        if not cjk.search(raw):
            continue
        if len(raw) > 100 or any(ch in raw for ch in "<>{}"):
            continue
        if raw.startswith("http") or raw.startswith("/") or raw.startswith("."):
            continue
        if already(src, m.start()):
            continue
        # skip object keys that look like comments? keep
        matches.append((m.start(), m.end(), raw))
        if raw not in zh:
            new_keys.append(raw)
            zh[raw] = raw
    if not matches:
        return 0, new_keys
    chars = list(src)
    for start, end, raw in sorted(matches, key=lambda x: -x[0]):
        chars[start:end] = list(f"BTC.t('{js_escape(raw)}')")
    path.write_text("".join(chars), encoding="utf-8")
    return len(matches), new_keys


def main() -> None:
    total = 0
    added = []
    for p in sorted(JS_DIR.glob("*.js")):
        n, nk = process(p)
        total += n
        added.extend(nk)
        print(f"{p.name}: {n}")
    zh_path.write_text(json.dumps(zh, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    en_path = ROOT / "lang" / "en.json"
    en = json.loads(en_path.read_text(encoding="utf-8")) if en_path.exists() else {}
    for k in zh:
        en.setdefault(k, k)
    en_path.write_text(json.dumps({k: en.get(k, k) for k in zh}, ensure_ascii=False, indent=2) + "\n")
    print("total", total, "new keys", len(added))


if __name__ == "__main__":
    main()
