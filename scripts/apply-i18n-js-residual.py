#!/usr/bin/env python3
"""Second-pass: wrap remaining bare Chinese string literals in public/js with BTC.t()."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZH = json.loads((ROOT / "lang" / "zh.json").read_text(encoding="utf-8"))
keys = sorted(
    [k for k in ZH if re.search(r"[\u4e00-\u9fff]", k)],
    key=len,
    reverse=True,
)
key_set = set(keys)


def js_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def already(src: str, start: int) -> bool:
    left = src[max(0, start - 40) : start]
    return bool(re.search(r"BTC\.t\s*\(\s*$", left)) or bool(
        re.search(r"(?:^|[^\w.])t\s*\(\s*$", left)
    )


def process(path: Path) -> int:
    src = path.read_text(encoding="utf-8")
    pattern = re.compile(r"""(['"])((?:\\.|[^\\])*?)\1""")
    matches = []
    for m in pattern.finditer(src):
        body = m.group(2)
        raw = (
            body.replace("\\'", "'")
            .replace('\\"', '"')
            .replace("\\n", "\n")
            .replace("\\\\", "\\")
        )
        if raw not in key_set:
            # also accept any cjk short UI string even if not in catalog yet
            if not re.search(r"[\u4e00-\u9fff]", raw):
                continue
            if len(raw) > 80 or any(x in raw for x in "<>{}"):
                continue
            # add to catalog later
            key_set.add(raw)
            keys.append(raw)  # not re-sorted but ok for this pass
        if already(src, m.start()):
            continue
        # skip import paths etc
        if raw.startswith("http") or raw.startswith("/"):
            continue
        matches.append((m.start(), m.end(), raw))

    if not matches:
        return 0
    chars = list(src)
    n = 0
    for start, end, raw in sorted(matches, key=lambda x: -x[0]):
        chars[start:end] = list(f"BTC.t('{js_escape(raw)}')")
        n += 1
    path.write_text("".join(chars), encoding="utf-8")
    return n


def main() -> None:
    total = 0
    new_keys = []
    for p in sorted((ROOT / "public" / "js").glob("*.js")):
        before = set(key_set)
        n = process(p)
        added = key_set - before
        if added:
            new_keys.extend(sorted(added))
        print(f"{p.name}: {n}")
        total += n
    print("total", total)
    if new_keys:
        for k in new_keys:
            ZH[k] = k
        (ROOT / "lang" / "zh.json").write_text(
            json.dumps(ZH, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        en_path = ROOT / "lang" / "en.json"
        en = json.loads(en_path.read_text(encoding="utf-8"))
        for k in new_keys:
            en.setdefault(k, k)
        en_path.write_text(json.dumps(en, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("added keys", len(new_keys))


if __name__ == "__main__":
    main()
