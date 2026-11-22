#!/usr/bin/env python3
"""ZMK のドキュメント (docs/src/data/hid.js) から、キーコードごとの OS 対応表を生成する。

ZMK 公式のキーコード一覧 (https://zmk.dev/docs/keymaps/list-of-keycodes) の
Windows / Linux / Android / macOS / iOS の列と同じデータ。
  使い方: python3 scripts/gen-keycode-os.py <zmk>/docs/src/data/hid.js > src/zmk/keycodes.os.generated.ts
"""
import json
import re
import sys

text = open(sys.argv[1], encoding="utf-8").read()
out = {}
# 各エントリ: names: [...] ... os: { windows: x, linux: x, android: x, macos: x, ios: x }
for m in re.finditer(r"names:\s*\[([^\]]*)\].*?os:\s*\{([^}]*)\}", text, re.S):
    names = re.findall(r'"([^"]+)"', m.group(1))
    flags = {}
    for k, v in re.findall(r"(\w+):\s*(true|false|null)", m.group(2)):
        flags[k] = {"true": True, "false": False, "null": None}[v]
    row = [flags.get(k) for k in ("windows", "linux", "android", "macos", "ios")]
    for n in names:
        out[n] = row

print("// このファイルは scripts/gen-keycode-os.py により ZMK v0.2.1 の docs/src/data/hid.js から自動生成されています。")
print("// 出典: https://zmk.dev/docs/keymaps/list-of-keycodes の OS 対応列 (true = 動作確認済み / false = 動作しない / null = 未確認)")
print("// 並び: [Windows, Linux, Android, macOS, iOS]")
print("export const KEYCODE_OS_SUPPORT: Record<string, (boolean | null)[]> = " + json.dumps(out, ensure_ascii=False) + ";")
