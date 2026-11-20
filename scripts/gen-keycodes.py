#!/usr/bin/env python3
"""
ZMK の dt-bindings ヘッダ (MIT License) からキーコード表を生成します。

使い方:
  git clone --depth 1 -b v0.2.1 https://github.com/zmkfirmware/zmk.git /tmp/zmk
  python3 scripts/gen-keycodes.py /tmp/zmk/app/include/dt-bindings/zmk > src/zmk/keycodes.generated.ts

ZMK に存在しないキーコードを追加しないため、キーコード名と値はすべてヘッダから機械的に取り出します。
"""
import json
import re
import sys
from pathlib import Path

inc = Path(sys.argv[1])

defines: dict[str, str] = {}
func_macros = {
    "ZMK_HID_USAGE": lambda page, id: (page << 16) | id,
    "APPLY_MODS": lambda mods, kc: (mods << 24) | kc,
}


def load(path: Path):
    for line in path.read_text().replace("\\\n", " ").splitlines():
        m = re.match(r"\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+?)\s*(//.*)?$", line)
        if m:
            defines[m.group(1)] = m.group(2)


for f in ["hid_usage_pages.h", "hid_usage.h", "modifiers.h"]:
    load(inc / f)

MOD_FUNCS = {"LC": 0x01, "LS": 0x02, "LA": 0x04, "LG": 0x08, "RC": 0x10, "RS": 0x20, "RA": 0x40, "RG": 0x80}


def evaluate(expr: str, depth=0) -> int:
    if depth > 30:
        raise ValueError(expr)
    expr = expr.strip()

    def repl_ident(m):
        name = m.group(0)
        if name in func_macros or name in MOD_FUNCS:
            return name
        if name in defines:
            return f"({evaluate(defines[name], depth + 1)})"
        return name

    py = re.sub(r"\b[A-Za-z_][A-Za-z0-9_]*\b", repl_ident, expr)
    env = {k: v for k, v in func_macros.items()}
    for k, mod in MOD_FUNCS.items():
        env[k] = (lambda mod: lambda kc: (mod << 24) | kc)(mod)
    return int(eval(py, {"__builtins__": {}}, env))


# keys.h をコメントブロック単位で読み、先頭の定義を正式名・それ以外を別名として扱う
entries = []
current = None
comment = ""
for line in (inc / "keys.h").read_text().replace("\\\n", " ").splitlines():
    c = re.match(r"\s*/\*\s*(.*?)\s*\*/", line)
    if c:
        comment = c.group(1)
        current = None
        continue
    m = re.match(r"\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+?)\s*(//.*)?$", line)
    if not m:
        continue
    name, expr = m.group(1), m.group(2)
    defines[name] = expr
    value = evaluate(expr)
    if current is not None and current["value"] == value:
        current["names"].append(name)
    else:
        current = {"names": [name], "value": value, "comment": comment}
        entries.append(current)

# 値が同じで別ブロックに定義されたもの（例: 別名の再定義）を統合
merged: dict[int, dict] = {}
order = []
for e in entries:
    if e["value"] in merged:
        for n in e["names"]:
            if n not in merged[e["value"]]["names"]:
                merged[e["value"]]["names"].append(n)
    else:
        merged[e["value"]] = e
        order.append(e["value"])

out = [merged[v] for v in order]

print("// このファイルは scripts/gen-keycodes.py により ZMK v0.2.1 の keys.h から自動生成されています。手動で編集しないでください。")
print("// Source: https://github.com/zmkfirmware/zmk/blob/v0.2.1/app/include/dt-bindings/zmk/keys.h (MIT License)")
print("export interface RawKeycode { names: string[]; value: number; comment: string }")
print("export const RAW_KEYCODES: RawKeycode[] = " + json.dumps(out, ensure_ascii=False, indent=0) + ";")
