#!/usr/bin/env python3
"""Fix broken HTML attrs: aria-label=t('x') -> aria-label=\"<%= t('x') %>\""""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "views"
pat = re.compile(
    r"""\b(aria-label|title|placeholder|alt|label)=t\((['"])(.*?)\2\)""",
    re.DOTALL,
)


def main() -> None:
    nfiles = ntotal = 0
    for p in ROOT.rglob("*.ejs"):
        src = p.read_text(encoding="utf-8")

        def repl(m: re.Match[str]) -> str:
            attr, _q, body = m.group(1), m.group(2), m.group(3)
            key_esc = body.replace("\\", "\\\\").replace("'", "\\'")
            return f'{attr}="<%= t(\'{key_esc}\') %>"'

        new, c = pat.subn(repl, src)
        if c:
            p.write_text(new, encoding="utf-8")
            nfiles += 1
            ntotal += c
            print(f"{p.relative_to(ROOT.parent)}: {c}")
    print(f"fixed {ntotal} in {nfiles} files")
    left = []
    for p in ROOT.rglob("*.ejs"):
        t = p.read_text(encoding="utf-8")
        if re.search(r"\b(aria-label|title|placeholder|alt|label)=t\(", t):
            left.append(str(p))
    print("remaining", len(left), left[:5])


if __name__ == "__main__":
    main()
