import { beforeAll, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { chocoKey } from '../keyboards/choco-key';
import { StudioDevice } from '../device/studio';
import { StudioSimulator } from '../device/simulator';
import { applyToDevice, buildBehaviorMap, layersFromDevice, planApply } from '../device/sync';
import { behaviorRegistry, parseKeymap } from '../zmk/keymap';
import { BUILTIN_BEHAVIORS } from '../zmk/behaviors';
import { keycodeByName } from '../zmk/keycodes';
import { keycodeOsSupport, bindingOsProblems } from '../zmk/keycodes.os';
import { createProject, migrateProject } from '../model/project';
import { decodeComboConfig, encodeComboConfig, readCombos, readMacros, writeCombo, writeMacroSteps } from '../model/runtime';
import { useEditor } from '../state/editor';
import type { Project } from '../model/types';

const K = (n: string) => keycodeByName(n)!.value;
const rt = chocoKey.runtime!;
const parsed = parseKeymap(chocoKey.files.studio[chocoKey.keymapPath]);
const known = [...BUILTIN_BEHAVIORS, ...parsed.customBehaviors];
const registry = behaviorRegistry(parsed.customBehaviors);

describe('コンボ設定のエンコード (firmware/choco-key/studio/src/runtime_combo.c と同じ形式)', () => {
  it('ビット配置', () => {
    // キー 0, 1, 41 / 判定 50ms / グループ 0 / グループ内レイヤー 0〜4 すべて
    const [p1, p2] = encodeComboConfig({ positions: [0, 1, 41], timeoutMs: 50, groups: [0], layersInGroup: [] });
    expect(p1).toBe(0b11);
    expect(p2).toBe((1 << 10) | (50 << 11) | (1 << 21));
    expect(p1).toBeLessThanOrEqual(0x7fffffff);
    expect(p2).toBeLessThanOrEqual(0x7fffffff);
    expect(decodeComboConfig(p1, p2)).toEqual({ positions: [0, 1, 41], timeoutMs: 50, groups: [0], layersInGroup: [] });
    // 最大値でも 31 bit に収まる (ZMK のパラメータ範囲 0〜INT32_MAX)
    const [a, b] = encodeComboConfig({ positions: [30, 31, 40, 41], timeoutMs: 1023, groups: [0, 1, 2, 3, 4], layersInGroup: [0, 1, 2, 3, 4] });
    expect(a).toBe(1 << 30);
    expect(b).toBeLessThanOrEqual(0x7fffffff);
    expect(decodeComboConfig(a, b)?.positions).toEqual([30, 31, 40, 41]);
  });
  it('仮想キーや範囲外のキーはエラー', () => {
    expect(() => encodeComboConfig({ positions: [0, 42], timeoutMs: 50, groups: [], layersInGroup: [] })).toThrow();
  });
});

async function connect(flash: { v: string | null }) {
  const sim = new StudioSimulator(chocoKey, { storage: { load: () => flash.v, save: (v) => (flash.v = v), clear: () => (flash.v = null) } });
  const dev = StudioDevice.fromTransport(sim.transport(), 'usb', {});
  const map = buildBehaviorMap(await dev.listBehaviors(), known);
  return { sim, dev, map };
}

describe('エンコーダー・マクロ・コンボを UF2 なしでキーボードに書き込む (ZMK Studio RPC・シミュレーター)', () => {
  it('書き込み → フラッシュ保存 → 電源再投入・再接続後も同じ内容を読み込める', async () => {
    const flash = { v: null as string | null };
    let { sim, dev, map } = await connect(flash);
    expect(map.byLabel.get('rt_combo')).toBeDefined();
    expect(map.byLabel.get('rtm0')).toBeDefined();
    let layers = layersFromDevice(await dev.getKeymap(), map, registry);
    expect(layers[0].bindings).toHaveLength(126);

    // エンコーダー: Windows Layer 0 の右エンコーダーを音量に、macOS Layer 1 の左を透過 + ズーム
    layers[0].bindings[42] = { b: 'kp', p: [K('C_VOL_UP')] };
    layers[0].bindings[43] = { b: 'kp', p: [K('C_VOL_DN')] };
    layers[6].bindings[44] = { b: 'kp', p: [(0x08 << 24 | K('KP_PLUS')) >>> 0] };
    layers[6].bindings[45] = { b: 'trans', p: [] };
    // マクロ 1: Ctrl+A → Ctrl+C
    layers = writeMacroSteps(layers, rt, 0, [
      { b: 'kp', p: [(0x01 << 24 | K('A')) >>> 0] },
      { b: 'kp', p: [(0x01 << 24 | K('C')) >>> 0] },
    ]);
    layers[1].bindings[0] = { b: 'rtm0', p: [] };
    // コンボ: A + S → Alt + F4 (Windows の全レイヤー)
    layers = writeCombo(layers, rt, 0, { id: 'x', name: 'close', positions: [10, 11], binding: { b: 'kp', p: [(0x04 << 24 | K('F4')) >>> 0] }, layers: [0, 1, 2, 3, 4], timeoutMs: 50 });

    const res = await applyToDevice(dev, layers, map, registry, () => {});
    expect(res.changed).toBe(9); // エンコーダー 4 + マクロ 2 + 割り当て 1 + コンボ 2
    expect(sim.unsaved).toBe(false);

    // 電源を入れ直して再接続
    sim.powerCycle();
    await dev.disconnect();
    ({ sim, dev, map } = await connect(flash));
    const back = layersFromDevice(await dev.getKeymap(), map, registry);
    expect(planApply(layers, back).bindings).toHaveLength(0);
    const p = { layers: back, runtimeNames: undefined };
    expect(readMacros(p, rt)[0].steps).toHaveLength(2);
    expect(readCombos(p, rt)).toEqual([expect.objectContaining({ positions: [10, 11], layers: [0, 1, 2, 3, 4], timeoutMs: 50 })]);
    expect(back[6].bindings[45]).toEqual({ b: 'trans', p: [] });

    // マクロ・コンボの削除も即時反映
    let edit = writeMacroSteps(back, rt, 0, []);
    edit = writeCombo(edit, rt, 0, null);
    await applyToDevice(dev, edit, map, registry, () => {});
    const after = layersFromDevice(await dev.getKeymap(), map, registry);
    expect(readMacros({ layers: after }, rt)[0].steps).toHaveLength(0);
    expect(readCombos({ layers: after }, rt)).toHaveLength(0);
  });
});

describe('Bluetooth プロファイルごとの OS', () => {
  beforeAll(async () => {
    (globalThis as unknown as { window: unknown }).window ??= { addEventListener() {} };
    await useEditor.getState().init();
  });
  const ed = () => useEditor.getState();

  it('各 Bluetooth プロファイルに自由に OS を選べ、他のプロファイルやキーの割り当ては変わらない', () => {
    const before = ed().project!;
    ed().setGroupOs(0, 'windows');
    ed().setGroupOs(1, 'macos');
    ed().setGroupOs(2, 'ios');
    ed().setGroupOs(3, 'linux');
    ed().setGroupOs(4, 'android');
    expect(ed().project!.os!.systems.map((s) => s.id)).toEqual(['windows', 'macos', 'ios', 'linux', 'android']);
    ed().setGroupOs(4, 'windows'); // 同じ OS を複数のプロファイルに選んでもよい
    const p = ed().project!;
    expect(p.os!.systems.map((s) => s.id)).toEqual(['windows', 'macos', 'ios', 'linux', 'windows']);
    expect(p.layers.map((l) => l.bindings)).toEqual(before.layers.map((l) => l.bindings));
    expect(p.layers[20].name).toBe('Win 0'); // 既定の名前は新しい OS の名前に
    expect(p.layers[10].name).toBe('iOS 0');
    // OS 切替キーは「Bluetooth プロファイル番号」で決まるので変わらない
    expect(p.layers[4].bindings[19]).toEqual({ b: 'os_sel', p: [4, 20] });
    ed().undo();
    expect(ed().project!.os!.systems[4].id).toBe('android');
  });

  it('OS ごとに使えないキーコードを判定し、割り当て済みのキーは削除せずに警告する', () => {
    const calc = keycodeByName('C_AL_CALCULATOR')!;
    expect(keycodeOsSupport(calc, 'windows')).toBeNull(); // 未確認
    expect(keycodeOsSupport(calc, 'macos')).toBe(false);
    expect(keycodeOsSupport(calc, 'linux')).toBe(true);
    expect(keycodeOsSupport(keycodeByName('A')!, 'ios')).toBe(true);
    // Bluetooth 3 (iOS) の Layer 0 に電卓キー → iOS では動作しない
    ed().setGroupOs(2, 'ios');
    ed().setLayerIndex(10);
    ed().select(0);
    ed().assign({ b: 'kp', p: [calc.value] }, 'calc');
    const b = ed().project!.layers[10].bindings[0];
    expect(bindingOsProblems(b, 'ios', registry)).toHaveLength(1);
    // OS を Linux に変えると問題なし。どちらでも割り当ては残る
    ed().setGroupOs(2, 'linux');
    expect(ed().project!.layers[10].bindings[0]).toEqual(b);
    expect(bindingOsProblems(b, 'linux', registry)).toHaveLength(0);
  });
});

describe('旧データ (schema 2: 25 レイヤー × 物理キーのみ) の移行', () => {
  it('エンコーダー・コンボ・マクロが仮想キーに移る', () => {
    const base = createProject(chocoKey, 'v2');
    const v2: Project = {
      ...base,
      schema: 2,
      layers: base.layers.map((l, i) => ({
        ...l,
        bindings: l.bindings.slice(0, 42),
        sensors: [
          { cw: { b: 'msc', p: [100] }, ccw: { b: 'msc', p: [0xff9c] } },
          { cw: { b: 'kp', p: [K('C_VOL_UP') + (i === 3 ? 0 : 0)] }, ccw: { b: 'kp', p: [K('C_VOL_DN')] } },
        ],
      })),
      combos: [{ id: 'c', name: 'esc', positions: [0, 1], binding: { b: 'kp', p: [K('ESC')] }, layers: [], timeoutMs: 40 }],
      macros: [{ label: 'hello', name: 'Hello', keys: [K('H'), K('I')], waitMs: 30, tapMs: 30 }],
      runtimeNames: undefined,
    };
    v2.layers[2].bindings[3] = { b: 'hello', p: [] };
    const m = migrateProject(v2, chocoKey);
    expect(m.schema).toBe(3);
    expect(m.layers.every((l) => l.bindings.length === 126 && !l.sensors)).toBe(true);
    expect(m.layers[7].bindings[44]).toEqual({ b: 'kp', p: [K('C_VOL_UP')] });
    expect(readCombos(m, rt)).toEqual([expect.objectContaining({ name: 'esc', positions: [0, 1], timeoutMs: 40 })]);
    expect(readMacros(m, rt)[0]).toEqual({ slot: 0, name: 'Hello', steps: [{ b: 'kp', p: [K('H')] }, { b: 'kp', p: [K('I')] }] });
    expect(m.layers[2].bindings[3]).toEqual({ b: 'rtm0', p: [] });
    expect(m.macros).toEqual([]);
    expect(m.combos).toEqual([]);
  });
});
