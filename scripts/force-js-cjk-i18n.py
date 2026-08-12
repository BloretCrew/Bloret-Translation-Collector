#!/usr/bin/env python3
"""Force-wrap remaining bare CJK string literals in public/js/*.js with BTC.t()."""
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


def process_file(path: Path) -> int:
    src = path.read_text(encoding="utf-8")
    # Match "..." or '...' containing CJK, not already BTC.t( right before
    pattern = re.compile(r"""(?<!BTC\.t\()(?<!t\()(['"])((?:\\.|[^\\])*?[\u4e00-\u9fff](?:\\.|[^\\])*?)\1""")
    n = 0
    out = []
    last = 0
    for m in pattern.finditer(src):
        # lookbehind for BTC.t( is fixed-width-ish; also check wider
        left = src[max(0, m.start() - 12) : m.start()]
        if re.search(r"BTC\.t\s*\(\s*$", left) or re.search(r"(?:^|[^\w.])t\s*\(\s*$", left):
            continue
        body = m.group(2)
        raw = (
            body.replace("\\'", "'")
            .replace('\\"', '"')
            .replace("\\n", "\n")
            .replace("\\\\", "\\")
        )
        if len(raw) > 150:
            continue
        if any(ch in raw for ch in ("<", ">", "{", "}")):
            # allow simple HTML fragments used in upload UI — still wrap as whole string
            pass
        out.append(src[last : m.start()])
        out.append(f"BTC.t('{js_escape(raw)}')")
        last = m.end()
        n += 1
        zh.setdefault(raw, raw)
    if not n:
        return 0
    out.append(src[last:])
    path.write_text("".join(out), encoding="utf-8")
    return n


def main() -> None:
    total = 0
    for p in sorted(JS_DIR.glob("*.js")):
        n = process_file(p)
        print(f"{p.name}: {n}")
        total += n
    zh_path.write_text(json.dumps(zh, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    en_path = ROOT / "lang" / "en.json"
    en = json.loads(en_path.read_text(encoding="utf-8")) if en_path.exists() else {}
    for k in zh:
        en.setdefault(k, k)
    en_path.write_text(
        json.dumps({k: en.get(k, k) for k in zh}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("total", total, "keys", len(zh))


if __name__ == "__main__":
    main()
