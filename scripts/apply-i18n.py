#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量把 BTC 里的中文 UI 字符串替换为 t('...') / <%= t('...') %> / BTC.t('...')。
策略：source-as-key，最长优先；跳过注释与已包裹的 t()/BTC.t()。

用法：
  python3 scripts/apply-i18n.py           # dry-run
  python3 scripts/apply-i18n.py --write   # 写回
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANG_ZH = ROOT / "lang" / "zh.json"

EJS_FILES = list((ROOT / "views").rglob("*.ejs"))
JS_FILES = list((ROOT / "public" / "js").glob("*.js"))
TS_FILES = [
    p
    for p in (ROOT / "src").rglob("*.ts")
    if not p.name.endswith(".test.ts")
    and "i18n-formats" not in str(p)
    and "json-i18n" not in str(p)
    and p.name != "i18n.ts"
]


def load_keys() -> list[str]:
    data = json.loads(LANG_ZH.read_text(encoding="utf-8"))
    keys = [k for k in data.keys() if k and re.search(r"[\u4e00-\u9fff]", k)]
    keys.sort(key=len, reverse=True)
    return keys


def js_escape(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )


def ejs_escape(s: str) -> str:
    return js_escape(s)


def already_wrapped_js(src: str, start: int) -> bool:
    left = src[max(0, start - 50) : start]
    if re.search(r"(?:BTC\.t|\.t|[^.\w]t)\s*\(\s*['\"]?\s*$", left):
        return True
    if re.search(r"translate\s*\(\s*['\"]?\s*$", left):
        return True
    return False


def already_wrapped_ejs(src: str, start: int) -> bool:
    left = src[max(0, start - 40) : start]
    if re.search(r"t\s*\(\s*['\"]?\s*$", left):
        return True
    if "<%= t(" in left or "<%- t(" in left:
        return True
    return False


def strip_comments_mask(src: str, mode: str) -> list[bool]:
    """True = inside comment, skip."""
    n = len(src)
    mask = [False] * n
    i = 0
    state = "code"  # code|line|block|squote|dquote|template|ejs
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if state == "code":
            if mode == "ejs" and c == "<" and nxt == "%":
                # enter ejs — mark until %> as non-replaceable for HTML pass,
                # but we still allow string replace inside ejs via quote pass
                state = "ejs"
                mask[i] = mask[i + 1] = True
                i += 2
                continue
            if c == "/" and nxt == "/":
                state = "line"
                mask[i] = mask[i + 1] = True
                i += 2
                continue
            if c == "/" and nxt == "*":
                state = "block"
                mask[i] = mask[i + 1] = True
                i += 2
                continue
            if c == "'":
                state = "squote"
                i += 1
                continue
            if c == '"':
                state = "dquote"
                i += 1
                continue
            if c == "`":
                state = "template"
                i += 1
                continue
            i += 1
            continue
        if state == "ejs":
            mask[i] = True
            if c == "%" and nxt == ">":
                mask[i + 1] = True
                state = "code"
                i += 2
                continue
            i += 1
            continue
        if state == "line":
            mask[i] = True
            if c == "\n":
                state = "code"
            i += 1
            continue
        if state == "block":
            mask[i] = True
            if c == "*" and nxt == "/":
                mask[i + 1] = True
                state = "code"
                i += 2
                continue
            i += 1
            continue
        if state == "squote":
            if c == "\\":
                i += 2
                continue
            if c == "'":
                state = "code"
            i += 1
            continue
        if state == "dquote":
            if c == "\\":
                i += 2
                continue
            if c == '"':
                state = "code"
            i += 1
            continue
        if state == "template":
            if c == "\\":
                i += 2
                continue
            if c == "`":
                state = "code"
                i += 1
                continue
            if c == "$" and nxt == "{":
                i += 2
                depth = 1
                while i < n and depth > 0:
                    ch = src[i]
                    if ch == "{":
                        depth += 1
                    elif ch == "}":
                        depth -= 1
                    i += 1
                continue
            i += 1
            continue
        i += 1
    return mask


def replace_quoted(
    src: str,
    keys: list[str],
    *,
    wrap: str,
    is_ejs: bool,
) -> tuple[str, int]:
    """Replace whole 'key' / \"key\" string literals with wrap('key').
    wrap is 't' or 'BTC.t'
    """
    key_set = set(keys)
    comment = strip_comments_mask(src, "ejs" if is_ejs else "js")
    pattern_q = re.compile(r"""(['"])((?:\\.|[^\\])*?)\1""", re.DOTALL)
    matches: list[tuple[int, int, str]] = []
    for m in pattern_q.finditer(src):
        body = m.group(2)
        raw = (
            body.replace("\\'", "'")
            .replace('\\"', '"')
            .replace("\\n", "\n")
            .replace("\\\\", "\\")
        )
        if raw not in key_set:
            continue
        if comment[m.start()]:
            continue
        if is_ejs:
            if already_wrapped_ejs(src, m.start()):
                continue
        else:
            if already_wrapped_js(src, m.start()):
                continue
        if len(raw) > 120:
            continue
        matches.append((m.start(), m.end(), raw))

    if not matches:
        return src, 0

    out = list(src)
    n = 0
    for start, end, raw in sorted(matches, key=lambda x: -x[0]):
        expr = f"{wrap}('{js_escape(raw)}')"
        out[start:end] = list(expr)
        n += 1
    return "".join(out), n


def replace_ejs_html_text(src: str, keys: list[str]) -> tuple[str, int]:
    """Replace bare HTML text >key< and attrs with <%= t('key') %>."""
    n = 0
    # attrs first
    for attr in ("placeholder", "title", "alt", "aria-label", "label"):
        for key in keys:
            esc = re.escape(key)
            pat = re.compile(rf'({attr}=["\']){esc}(["\'])')
            def repl(m, key=key):
                nonlocal n
                # skip if already t(
                if "t(" in m.group(0):
                    return m.group(0)
                n += 1
                return f"{m.group(1)}<%= t('{ejs_escape(key)}') %>{m.group(2)}"

            src, _ = pat.subn(repl, src)

    # >key< text nodes — careful with partial
    for key in keys:
        if key not in src:
            continue
        esc = re.escape(key)
        # only plain >key< not already having <%= 
        pat = re.compile(rf">(\s*){esc}(\s*)<")
        parts = []
        last = 0
        for m in pat.finditer(src):
            window = src[max(0, m.start() - 10) : m.end() + 10]
            if "<%= t(" in window or "<%- t(" in window:
                continue
            # skip inside script? rough
            parts.append(src[last : m.start()])
            parts.append(f">{m.group(1)}<%= t('{ejs_escape(key)}') %>{m.group(2)}<")
            last = m.end()
            n += 1
        if parts:
            parts.append(src[last:])
            src = "".join(parts)

    # sfIcon label: '中文'
    for key in keys:
        esc = re.escape(key)
        pat = re.compile(rf"(label:\s*)(['\"]){esc}\2")
        def repl2(m, key=key):
            nonlocal n
            n += 1
            return f"{m.group(1)}t('{ejs_escape(key)}')"  # already inside <% %> often as object

        # Only safe inside EJS scriptlet object literals — label: 'x' -> label: t('x')
        # If in HTML attribute context this is wrong; our extract used label: in sfIcon calls inside EJS
        src2, c = pat.subn(repl2, src)
        # Actually repl2 always increments even via subn callback... use manual
        # redo manual:
    # manual label pass
    out_parts = []
    last = 0
    label_n = 0
    for key in keys:
        pass
    # simpler one pass with any key
    key_set = set(keys)
    for m in list(re.finditer(r"(label:\s*)(['\"])([^'\"]*?)\2", src)):
        body = m.group(3)
        if body not in key_set:
            continue
        if already_wrapped_ejs(src, m.start(3)):
            continue
        # build later from end
    matches = []
    for m in re.finditer(r"(label:\s*)(['\"])([^'\"]*?)\2", src):
        body = m.group(3)
        if body not in key_set:
            continue
        if already_wrapped_ejs(src, m.start()):
            continue
        matches.append((m.start(), m.end(), body, m.group(1)))
    if matches:
        chars = list(src)
        for start, end, body, prefix in sorted(matches, key=lambda x: -x[0]):
            rep = f"{prefix}t('{ejs_escape(body)}')"
            chars[start:end] = list(rep)
            n += 1
        src = "".join(chars)

    return src, n


def ensure_ts_import(src: str) -> str:
    if re.search(r"""from\s+['"]@/lib/i18n['"]""", src):
        # ensure t is imported
        if re.search(r"""import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@/lib/i18n['"]""", src):
            return src
        def add_t(m):
            inner = m.group(1)
            if re.search(r"\bt\b", inner):
                return m.group(0)
            return f"import {{ t, {inner.strip()} }} from '@/lib/i18n'"
        new_src, c = re.subn(
            r"""import\s*\{([^}]*)\}\s*from\s*['"]@/lib/i18n['"]""",
            add_t,
            src,
            count=1,
        )
        if c:
            return new_src
    # add import after first import or at top
    line = "import { t } from '@/lib/i18n';\n"
    m = re.search(r"^import\s", src, re.M)
    if m:
        # after last import block start — insert before first import is fine
        return src[: m.start()] + line + src[m.start() :]
    return line + src


def process_file(path: Path, keys: list[str], write: bool) -> int:
    src = path.read_text(encoding="utf-8")
    rel = str(path.relative_to(ROOT))
    total = 0
    new_src = src

    if path.suffix == ".ejs":
        new_src, n1 = replace_quoted(new_src, keys, wrap="t", is_ejs=True)
        total += n1
        new_src, n2 = replace_ejs_html_text(new_src, keys)
        total += n2
    elif path.suffix == ".js":
        new_src, n1 = replace_quoted(new_src, keys, wrap="BTC.t", is_ejs=False)
        total += n1
    elif path.suffix == ".ts":
        new_src, n1 = replace_quoted(new_src, keys, wrap="t", is_ejs=False)
        total += n1
        if n1 > 0:
            new_src = ensure_ts_import(new_src)

    print(f"  {rel}: {total}")
    if write and total > 0 and new_src != src:
        path.write_text(new_src, encoding="utf-8")
    return total


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    keys = load_keys()
    print(f"loaded {len(keys)} keys")
    total = 0
    for p in sorted(EJS_FILES) + sorted(JS_FILES) + sorted(TS_FILES):
        total += process_file(p, keys, args.write)
    print(f"total replacements: {total}")


if __name__ == "__main__":
    main()
