import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { chocoKey } from '../keyboards/choco-key';
import { buildZip } from '../lib/files';
import { createProject } from '../model/project';
import { absLayer, retargetOsKeys } from '../model/os';
import { keycodeByName } from '../zmk/keycodes';
import { ENCODER_ACTIONS } from '../model/encoders';
import { resolveShortcut } from '../model/shortcuts';

// ZMK 実ビルド検証用の ZIP を出力 (通常のテスト実行では OUT_DIR が無いのでスキップ)
it.skipIf(!process.env.OUT_DIR)('gen', async () => {
  const p = createProject(chocoKey, 'build-test');
  const os = p.os!;
  const K = (n: string) => keycodeByName(n)!.value;
  const enc = (id: string, o: 'windows' | 'macos') => ENCODER_ACTIONS.find((a) => a.id === id)!.binding(o, 'jis', 100);
  // キー割り当て
  p.layers[0].bindings[0] = { b: 'mt', p: [K('LSHFT'), K('Q')] };
  p.layers[absLayer(os, 1, 1)].bindings[5] = { b: 'mo', p: [absLayer(os, 1, 3)] };
  p.layers[absLayer(os, 1, 0)].name = 'Mac Base';
  // OS のデフォルトレイヤー変更 (macOS → Layer 2)
  const os2 = { ...os, systems: os.systems.map((s, i) => (i === 1 ? { ...s, defaultLayer: 2 } : s)) };
  p.layers = retargetOsKeys(p.layers, os, os2);
  p.os = os2;
  p.layers[absLayer(os, 2, 4)].bindings[20] = { b: 'os_to', p: [absLayer(os2, 1, 2)] };
  // ショートカット (修飾 + 1 キー / 複数キーのマクロ)
  p.shortcuts = [
    { id: 'paste1', name: 'テキストのみ貼り付け', os: 'windows', keys: ['LCTRL', 'LSHFT', 'V'].map(K) },
    { id: 'multi1', name: 'A+B 同時押し', os: 'all', keys: ['LCTRL', 'A', 'B'].map(K) },
  ];
  p.layers[absLayer(os, 0, 1)].bindings[10] = resolveShortcut(p.shortcuts[0]).binding!;
  p.layers[absLayer(os, 0, 1)].bindings[11] = resolveShortcut(p.shortcuts[1]).binding!;
  // エンコーダー
  p.layers[0].sensors = [
    { cw: enc('vol_up', 'windows'), ccw: enc('vol_dn', 'windows') },
    { cw: enc('tab_next', 'windows'), ccw: enc('tab_prev', 'windows') },
  ];
  p.layers[absLayer(os, 1, 1)].sensors = [
    { cw: enc('zoom_in', 'macos'), ccw: enc('zoom_out', 'macos') },
    { cw: { b: 'trans', p: [] }, ccw: { b: 'trans', p: [] } },
  ];
  // コンボ
  p.combos = [
    { id: 'c1', name: 'close_window', positions: [10, 11], binding: { b: 'kp', p: [(0x04 << 24 | K('F4')) >>> 0] }, layers: [0, 1, 2, 3, 4], timeoutMs: 50 },
    { id: 'c2', name: 'zx', positions: [20, 21], binding: { b: 'kp', p: [K('A')] }, layers: [], timeoutMs: 50 },
    { id: 'c3', name: 'multi', positions: [22, 23], binding: resolveShortcut(p.shortcuts[1]).binding!, layers: [], timeoutMs: 50 },
  ];
  for (const v of ['studio', 'original'] as const) {
    const { blob, warnings } = await buildZip(p, chocoKey, v);
    writeFileSync(`${process.env.OUT_DIR}/${v}.zip`, Buffer.from(await blob.arrayBuffer()));
    if (warnings.length) throw new Error(warnings.join('\n'));
  }
});
