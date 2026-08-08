#!/usr/bin/env python3
"""Extract unique CJK UI strings from views / public/js / routes / app.ts"""
from __future__ import annotations

import json
import pathlib
import re
from collections import OrderedDict

ROOT = pathlib.Path(__file__).resolve().parent.parent
CJK = re.compile(r"[\u4e00-\u9fff]")
STR_RE = re.compile(
    r"""(?P<q>['"`])(?P<body>(?:\\.|(?!(?P=q)).)*?[\u4e00-\u9fff](?:\\.|(?!(?P=q)).)*?)(?P=q)""",
    re.DOTALL,
)


def bad_key(s: str) -> bool:
    if not s or not CJK.search(s):
        return True
    if len(s) > 120:
        return True
    if any(x in s for x in ("<", ">", "{", "}", "${", "<%", "%>")):
        return True
    if s.startswith("src/") or s.startswith("./"):
        return True
    return False


def add(keys: OrderedDict, s: str, src: str) -> None:
    s = s.replace("\\n", "\n").replace("\\t", "\t")
    s = s.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")
    s = s.strip()
    if bad_key(s):
        return
    if "\n" not in s:
        s2 = re.sub(r"\s+", " ", s).strip()
    else:
        s2 = s
    if bad_key(s2):
        return
    if s2 not in keys:
        keys[s2] = []
    if src not in keys[s2]:
        keys[s2].append(src)


def main() -> None:
    keys: OrderedDict = OrderedDict()
    targets: list[pathlib.Path] = []
    targets.extend((ROOT / "views").rglob("*.ejs"))
    targets.extend((ROOT / "public" / "js").glob("*.js"))
    for p in (ROOT / "src").rglob("*.ts"):
        if p.name.endswith(".test.ts"):
            continue
        if "i18n-formats" in str(p) or "json-i18n" in str(p):
            continue
        # skip the i18n module itself once it has no UI strings of interest
        targets.append(p)

    for path in targets:
        text = path.read_text(encoding="utf-8")
        rel = str(path.relative_to(ROOT))
        for m in STR_RE.finditer(text):
            add(keys, m.group("body"), rel)
        if path.suffix == ".ejs":
            for m in re.finditer(r">([^<>%]*[\u4e00-\u9fff][^<>%]*?)<", text):
                chunk = m.group(1)
                if "<%" in chunk or "%>" in chunk:
                    continue
                chunk = re.sub(r"\s+", " ", chunk).strip()
                if CJK.search(chunk) and len(chunk) <= 80:
                    add(keys, chunk, rel)
            for m in re.finditer(
                r"""(?:title|aria-label|placeholder|alt|label)\s*=\s*["']([^"']*[\u4e00-\u9fff][^"']*)["']""",
                text,
            ):
                add(keys, m.group(1), rel)
            for m in re.finditer(
                r"""label:\s*['"]([^'"]*[\u4e00-\u9fff][^'"]*)['"]""",
                text,
            ):
                add(keys, m.group(1), rel)

    print("unique keys", len(keys))
    lens = sorted(len(k) for k in keys)
    if lens:
        print("len min/med/max", lens[0], lens[len(lens) // 2], lens[-1])
    for i, (k, srcs) in enumerate(list(keys.items())[:40]):
        print(f"{i:3d} {k!r}  <- {srcs[0]}")

    out = {k: k for k in keys}
    lang_dir = ROOT / "lang"
    lang_dir.mkdir(exist_ok=True)
    (lang_dir / "zh.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (lang_dir / "en.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (lang_dir / ".keys-sources.json").write_text(
        json.dumps(keys, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("wrote lang/zh.json", len(out))


if __name__ == "__main__":
    main()
