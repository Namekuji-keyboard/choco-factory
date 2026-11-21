import { beforeAll, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { chocoKey } from '../keyboards/choco-key';
import { useEditor } from '../state/editor';
import { buildKeymap, projectFile } from '../lib/files';
import { createProject, migrateProject } from '../model/project';
import { OS_LIST, absLayer, defaultOsLayout, osDefaultIndex } from '../model/os';
import { SHORTCUT_PRESETS, presetKeys, resolveShortcut } from '../model/shortcuts';
import { ENCODER_ACTIONS } from '../model/encoders';
import { formatBinding, layersFromParsed, parseKeymap, behaviorRegistry, sensorsEqual } from '../zmk/keymap';
import { keycodeByName } from '../zmk/keycodes';
import { getProject, putProject } from '../storage/db';
import type { Project, ShortcutDef } from '../model/types';

const K = (n: string) => keycodeByName(n)!.value;
const ed = () => useEditor.getState();
const reg = behaviorRegistry();
const fmt = (b: { b: string; p: number[] }) => formatBinding(b, { behaviors: reg });
const sc = (keys: string[]): ShortcutDef => ({ id: `t${keys.join('')}`, name: keys.join('+'), os: 'windows', keys: keys.map(K) });

beforeAll(async () => {
  // Node 環境用の最小限の window (init が beforeunload を登録するだけ)
  (globalThis as unknown as { window: unknown }).window ??= { addEventListener() {} };
  await ed().init();
});

describe('OS 別キーマップ (5 OS × 5 レイヤー = 25 レイヤー)', () => {
  it('25 レイヤーがそれぞれ独立して編集できる', () => {
    const p0 = ed().project!;
    expect(p0.layers).toHaveLength(25);
    expect(p0.os!.systems.map((s) => s.id)).toEqual(['windows', 'macos', 'linux', 'ios', 'android']);
    // 25 レイヤーすべての キー #1 に別々の値を書く
    for (let o = 0; o < 5; o++) {
      for (let j = 0; j < 5; j++) {
        ed().setLayerIndex(absLayer(p0.os!, o, j));
        ed().select(0);
        ed().assign({ b: 'kp', p: [K('F1') + o * 5 + j] }, 'test');
      }
    }
    const p = ed().project!;
    const values = p.layers.map((l) => l.bindings[0].p[0]);
    expect(new Set(values).size).toBe(25);
    values.forEach((v, i) => expect(v).toBe(K('F1') + i));
    // 他のキーは変わらない
    expect(p.layers[5].bindings[1]).toEqual(p0.layers[5].bindings[1]);
  });

  it('Windows の Layer 0 を編集しても macOS の Layer 0 には影響しない', () => {
    const before = ed().project!.layers[5].bindings[2];
    ed().setLayerIndex(0);
    ed().select(2);
    ed().assign({ b: 'kp', p: [K('Z')] }, 'win only');
    expect(ed().project!.layers[0].bindings[2]).toEqual({ b: 'kp', p: [K('Z')] });
    expect(ed().project!.layers[5].bindings[2]).toEqual(before);
  });

  it('OS を切り替えると同じ番号のレイヤーを表示', () => {
    ed().setLayerIndex(absLayer(defaultOsLayout(), 0, 3));
    ed().setOs(1);
    expect(ed().layerIndex).toBe(8);
    ed().setOs(4);
    expect(ed().layerIndex).toBe(23);
  });

  it('各 OS のデフォルトレイヤーを個別に変更でき、OS 切替キーの移動先も更新される', () => {
    ed().setOsDefault(1, 2); // macOS → Layer 2
    ed().setOsDefault(3, 1); // iOS → Layer 1
    const os = ed().project!.os!;
    expect(os.systems.map((s) => s.defaultLayer)).toEqual([0, 2, 0, 1, 0]);
    // 各 OS の Layer 4 の OS 切替キー (右手 2 段目)
    const l4 = ed().project!.layers[absLayer(os, 0, 4)].bindings;
    expect(l4[15]).toEqual({ b: 'os_sel', p: [0, 0] });
    expect(l4[16]).toEqual({ b: 'os_sel', p: [1, 7] }); // BT1 + macOS Layer 2
    expect(l4[18]).toEqual({ b: 'os_sel', p: [3, 16] }); // BT3 + iOS Layer 1
    // 別の OS の Layer 4 の OS 切替キーも同じく更新
    expect(ed().project!.layers[absLayer(os, 4, 4)].bindings[16]).toEqual({ b: 'os_sel', p: [1, 7] });
    // Undo で元に戻る
    ed().undo();
    expect(ed().project!.os!.systems[3].defaultLayer).toBe(0);
    expect(ed().project!.layers[4].bindings[18]).toEqual({ b: 'os_sel', p: [3, 15] });
    ed().redo();
    expect(ed().project!.layers[4].bindings[18]).toEqual({ b: 'os_sel', p: [3, 16] });
  });

  it('BT プロファイル切替と OS レイヤー切替が連動したキーマップを出力する', () => {
    const { text, warnings } = buildKeymap(ed().project!, chocoKey);
    expect(warnings).toEqual([]);
    expect(text).toContain('&os_sel 1 7');
    expect(text).toContain('&os_sel 3 16');
    // マクロ定義: BT_SEL (3) → &to の順
    expect(text).toMatch(/os_sel: os_sel \{[\s\S]*&macro_param_1to2 &bt 3 MACRO_PLACEHOLDER &macro_param_2to1 &to MACRO_PLACEHOLDER/);
    // Bluetooth だけの切り替え (&bt BT_SEL) も残っている
    expect(text).toContain('&bt BT_SEL 0');
    const again = parseKeymap(text);
    expect(again.layers).toHaveLength(25);
  });

  it('OS のコピーではレイヤー参照がコピー先の OS 内に付け替えられる', () => {
    ed().copyOs(0, 2); // Windows → Linux
    const p = ed().project!;
    // Windows L0 の &lt 4 ESC → Linux では &lt 14 ESC
    expect(p.layers[absLayer(p.os!, 2, 0)].bindings[41]).toEqual({ b: 'lt', p: [14, K('ESC')] });
    // OS 切替キーはそのまま
    expect(p.layers[absLayer(p.os!, 2, 4)].bindings[16]).toEqual({ b: 'os_sel', p: [1, 7] });
    ed().undo();
  });

  it('別の OS へのコピー & 貼り付けでレイヤー参照が付け替えられる', () => {
    ed().setLayerIndex(0);
    ed().select(41); // &lt 4 ESC (Windows)
    ed().copy();
    ed().setLayerIndex(absLayer(ed().project!.os!, 3, 0)); // iOS Layer 0
    ed().select(40);
    ed().paste();
    expect(ed().project!.layers[15].bindings[40]).toEqual({ b: 'lt', p: [19, K('ESC')] });
    ed().undo();
  });

  it('旧形式 (5 レイヤー) のプロジェクトを移行できる', () => {
    const base = createProject(chocoKey, 'old');
    const legacy: Project = { ...base, schema: undefined, os: undefined, shortcuts: undefined, combos: undefined, layers: layersFromParsed(parseKeymap(chocoKey.files.original[chocoKey.keymapPath])) };
    legacy.layers[0].bindings[0] = { b: 'kp', p: [K('X')] };
    const m = migrateProject(legacy, chocoKey);
    expect(m.layers).toHaveLength(25);
    expect(m.schema).toBe(2);
    // 旧データの内容が各 OS にコピーされる
    for (let o = 0; o < 5; o++) expect(m.layers[o * 5].bindings[0]).toEqual({ b: 'kp', p: [K('X')] });
    // macOS の Layer 0 の &lt 1 → &lt 6
    expect(m.layers[5].bindings[34].p[0]).toBe(6);
    expect(m.layers[0].sensors).toHaveLength(2);
  });
});

describe('ショートカット', () => {
  it.each([
    [['LCTRL', 'C'], '&kp LC(C)'],
    [['LCTRL', 'V'], '&kp LC(V)'],
    [['LCTRL', 'LSHFT', 'V'], '&kp LC(LS(V))'],
    [['LCTRL', 'LALT', 'DEL'], '&kp LC(LA(DEL))'],
    [['LGUI', 'LSHFT', 'N4'], '&kp LS(LG(N4))'],
    [['LCTRL', 'LSHFT', 'LALT', 'S'], '&kp LC(LS(LA(S)))'],
    [['LCTRL', 'LSHFT'], '&kp LC(LSHFT)'],
  ])('%j → %s (ZMK Studio で直接書き込める)', (keys, expected) => {
    const r = resolveShortcut(sc(keys));
    expect(r.kind).toBe('kp');
    expect(fmt(r.binding!)).toBe(expected);
  });

  it('通常キーを 2 個以上含む組み合わせはマクロ、7 個以上はエラー', () => {
    const r = resolveShortcut(sc(['LCTRL', 'A', 'B', 'C']));
    expect(r.kind).toBe('macro');
    expect(r.binding!.b).toMatch(/^sc_/);
    expect(resolveShortcut(sc(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).kind).toBe('invalid');
    expect(resolveShortcut(sc(['A', 'B', 'C', 'D', 'E', 'F'])).kind).toBe('macro');
    expect(resolveShortcut(sc([])).kind).toBe('invalid');
  });

  it('すべての OS のプリセットが有効な組み合わせ', () => {
    for (const o of OS_LIST) {
      for (const p of SHORTCUT_PRESETS[o.id]) expect(resolveShortcut({ id: 'x', keys: presetKeys(p) }).kind).toBe('kp');
    }
  });

  it('作成・割り当て・編集 (割り当て済みのキーも更新)・複製・削除・Undo / Redo', () => {
    const s: ShortcutDef = { id: 'paste-plain', name: 'テキストのみ貼り付け', os: 'windows', keys: ['LCTRL', 'LSHFT', 'V'].map(K) };
    ed().saveShortcut(s);
    ed().setLayerIndex(1);
    ed().select(3);
    ed().assign(resolveShortcut(s).binding!, 'assign');
    expect(fmt(ed().project!.layers[1].bindings[3])).toBe('&kp LC(LS(V))');
    // キーの追加 (4 キー: 通常キー 2 個 → マクロ)
    ed().saveShortcut({ ...s, keys: [...s.keys, K('A')] });
    const label = resolveShortcut(s).binding!.b;
    expect(ed().project!.layers[1].bindings[3].b).toMatch(/^sc_/);
    const { text } = buildKeymap(ed().project!, chocoKey);
    expect(text).toContain('&macro_press &kp LCTRL &kp LSHFT &kp V &kp A>, <&macro_pause_for_release>, <&macro_release &kp A &kp V &kp LSHFT &kp LCTRL>');
    expect(parseKeymap(text).customBehaviors.map((b) => b.label)).toContain(ed().project!.layers[1].bindings[3].b);
    expect(label).toBe('kp');
    // 並べ替え
    ed().saveShortcut({ ...s, keys: [K('V'), K('LSHFT'), K('LCTRL')] });
    expect(fmt(ed().project!.layers[1].bindings[3])).toBe('&kp LC(LS(V))');
    // 削除 → Undo で戻る
    ed().removeShortcut(s.id);
    expect(ed().project!.shortcuts!.find((x) => x.id === s.id)).toBeUndefined();
    ed().undo();
    expect(ed().project!.shortcuts!.find((x) => x.id === s.id)).toBeDefined();
    ed().redo();
    expect(ed().project!.shortcuts!.find((x) => x.id === s.id)).toBeUndefined();
  });
});

describe('ロータリーエンコーダー', () => {
  it('時計回り / 反時計回りをレイヤーごとに設定し、sensor-bindings に出力', () => {
    const os = ed().project!.os!;
    const volUp = ENCODER_ACTIONS.find((a) => a.id === 'vol_up')!.binding('windows', 'jis', 100);
    const volDn = ENCODER_ACTIONS.find((a) => a.id === 'vol_dn')!.binding('windows', 'jis', 100);
    const tabNext = ENCODER_ACTIONS.find((a) => a.id === 'tab_next')!.binding('windows', 'jis', 100);
    const tabPrev = ENCODER_ACTIONS.find((a) => a.id === 'tab_prev')!.binding('windows', 'jis', 100);
    const zoomIn = ENCODER_ACTIONS.find((a) => a.id === 'zoom_in')!.binding('macos', 'jis', 100);
    const zoomOut = ENCODER_ACTIONS.find((a) => a.id === 'zoom_out')!.binding('macos', 'jis', 100);
    ed().setSensor([absLayer(os, 0, 0)], 0, { cw: volUp, ccw: volDn });
    ed().setSensor([absLayer(os, 0, 1)], 0, { cw: tabNext, ccw: tabPrev });
    ed().setSensor([absLayer(os, 1, 1)], 0, { cw: zoomIn, ccw: zoomOut });
    const p = ed().project!;
    expect(fmt(zoomIn)).toBe('&kp LG(KPLS)');
    const { text, warnings } = buildKeymap(p, chocoKey);
    expect(warnings).toEqual([]);
    expect(text).toMatch(/bindings = <&kp C_VOL(UME)?_UP>, <&kp C_VOL(UME)?_D(OW)?N>; \/\/ 時計回り, 反時計回り/);
    const again = layersFromParsed(parseKeymap(text));
    // 25 レイヤーすべてで、設定した内容が独立して復元される
    again.forEach((l, i) => expect(sensorsEqual(l.sensors, p.layers[i].sensors)).toBe(true));
    expect(again[0].sensors![0].cw).toEqual(volUp);
    expect(again[1].sensors![0].cw).toEqual(tabNext);
    expect(again[6].sensors![0].cw).toEqual(zoomIn);
    expect(again[5].sensors![0].cw).toEqual({ b: 'msc', p: [100] }); // macOS Layer 0 は元のまま
    // 透過 (両方向): ZMK v0.2.1 は sensor-bindings に &trans を書けないので、末尾のエンコーダーを省略して表す
    const T = { b: 'trans', p: [] };
    ed().setSensor([absLayer(os, 2, 3)], 1, { cw: T, ccw: T });
    let out = buildKeymap(ed().project!, chocoKey);
    expect(out.text).not.toContain('&trans>');
    expect(out.text).toMatch(/sensor-bindings = <&scroll_up_down>;/);
    // 両方のエンコーダーを透過 → sensor-bindings 自体を出力しない
    ed().setSensor([absLayer(os, 2, 3)], 0, { cw: T, ccw: T });
    out = buildKeymap(ed().project!, chocoKey);
    expect(parseKeymap(out.text).layers[absLayer(os, 2, 3)].sensorBindings).toBeUndefined();
    expect(out.warnings).toEqual([]);
    // 先頭だけ透過はできない → 「なし」として出力し、警告
    ed().setSensor([absLayer(os, 2, 2)], 0, { cw: T, ccw: T });
    out = buildKeymap(ed().project!, chocoKey);
    expect(out.warnings.some((w) => w.includes('透過にはできません'))).toBe(true);
    expect(out.text).toMatch(/bindings = <&none>, <&none>;/);
    ed().undo();
  });

  it('すべてのプリセットが全 OS で有効なバインディングを返す', () => {
    for (const a of ENCODER_ACTIONS) {
      for (const o of OS_LIST) {
        const b = a.binding(o.id, 'jis', 100);
        expect(fmt(b)).toMatch(/^&(kp|msc) /);
      }
    }
  });
});

describe('コンボ', () => {
  it('A + S → Alt + F4 / Z + X → A を出力し、再読み込みできる', () => {
    const os = ed().project!.os!;
    const winLayers = Array.from({ length: 5 }, (_, j) => absLayer(os, 0, j));
    ed().saveCombo({ id: 'c1', name: 'close_window', positions: [10, 11], binding: { b: 'kp', p: [(0x04 << 24 | K('F4')) >>> 0] }, layers: winLayers, timeoutMs: 50 });
    ed().saveCombo({ id: 'c2', name: 'zx_a', positions: [20, 21], binding: { b: 'kp', p: [K('A')] }, layers: [], timeoutMs: 40 });
    const { text } = buildKeymap(ed().project!, chocoKey);
    expect(text).toContain('key-positions = <10 11>;');
    expect(text).toContain('bindings = <&kp LA(F4)>;');
    expect(text).toContain('layers = <0 1 2 3 4>;');
    const parsed = parseKeymap(text);
    expect(parsed.combos.map((c) => [c.name, c.positions, c.layers, c.timeoutMs])).toEqual([
      ['close_window', [10, 11], [0, 1, 2, 3, 4], 50],
      ['zx_a', [20, 21], [], 40],
    ]);
  });
});

describe('保存・復元', () => {
  it('IndexedDB に保存した 25 レイヤー・ショートカット・コンボ・エンコーダーが復元される', async () => {
    const p = ed().project!;
    await putProject(p);
    const back = await getProject(p.id);
    expect(back!.layers).toEqual(p.layers);
    expect(back!.os).toEqual(p.os);
    expect(back!.combos).toEqual(p.combos);
    expect(back!.shortcuts).toEqual(p.shortcuts);
  });
  it('プロジェクト JSON のエクスポート → インポート', async () => {
    const p = ed().project!;
    const file = JSON.parse(JSON.stringify(projectFile(p)));
    expect(file.version).toBe(2);
    await ed().importProject(file.project);
    const q = ed().project!;
    expect(q.id).not.toBe(p.id);
    expect(q.layers).toEqual(p.layers);
    expect(q.os).toEqual(p.os);
    expect(osDefaultIndex(q.os!, 1)).toBe(7);
  });
});
