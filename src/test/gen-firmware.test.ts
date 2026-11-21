import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { chocoKey } from '../keyboards/choco-key';
import { exportKeymap, layersFromParsed, parseKeymap } from '../zmk/keymap';
import { osLayersFromKeymap } from '../model/project';
import { OS_LIST, absLayer, defaultOsLayout, osSelectBinding } from '../model/os';

/**
 * firmware/choco-key/studio/config/Choco-Key.keymap (OS 別 25 レイヤー版) を生成する。
 * 元にするのは 5 レイヤー版 (Studio 対応・予備レイヤー付き) のキーマップ。
 *   GEN_FW=<5 レイヤー版のパス> npx vitest run src/test/gen-firmware.test.ts
 */
it.skipIf(!process.env.GEN_FW)('generate 25-layer firmware keymap', () => {
  let src = readFileSync(process.env.GEN_FW!, 'utf8');
  // 予備レイヤー (status = "reserved") は不要になるので削除
  src = src.replace(/\n\s*\/\/ ZMK Studio から追加できる予備レイヤー[^\n]*\n(\s*layer_\d+ \{ status = "reserved"; \};\n)+/, '\n');
  const os = defaultOsLayout();
  const layers = osLayersFromKeymap(chocoKey, src, layersFromParsed(parseKeymap(src)));
  // 各 OS の Layer 4 の右手 2 段目 (キー 16〜20) に OS 切替キー (BT プロファイル連動) を置く
  OS_LIST.forEach((_, o) => {
    const l4 = layers[absLayer(os, o, 4)];
    OS_LIST.forEach((__, target) => {
      const pos = 15 + target;
      if (l4.bindings[pos].b !== 'trans') throw new Error(`position ${pos} is not &trans`);
      l4.bindings[pos] = osSelectBinding(os, target, true);
    });
  });
  const { text, warnings } = exportKeymap(src, layers, chocoKey, [], { osMacros: true });
  if (warnings.length) throw new Error(warnings.join('\n'));
  const header = `/*
 * Choco-Key キーマップ (OS 別 25 レイヤー版 / Choco Factory で生成)
 *
 * レイヤー番号 = OS × 5 + OS 内のレイヤー番号
 *   Windows: 0〜4 / macOS: 5〜9 / Linux: 10〜14 / iOS・iPadOS: 15〜19 / Android: 20〜24
 * 各 OS の Layer 4 の右手 2 段目に OS 切替キー (&os_sel <BT プロファイル> <レイヤー>) があります。
 *   Windows = BT 0 / macOS = BT 1 / Linux = BT 2 / iOS = BT 3 / Android = BT 4
 * 電源投入時はレイヤー 0 (Windows Layer 0) から始まります (ZMK はアクティブなレイヤーを保存しないため)。
 */

`;
  writeFileSync(process.env.OUT_FILE ?? 'firmware/choco-key/studio/config/Choco-Key.keymap', header + text);
});
