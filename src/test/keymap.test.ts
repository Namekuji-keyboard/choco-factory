import { describe, expect, it } from 'vitest';
import type { Layer } from '../model/types';
import { chocoKey } from '../keyboards/choco-key';
import { exportKeymap, formatBinding, behaviorRegistry, layersFromParsed, parseKeymap } from '../zmk/keymap';
import { formatKeycode, keycodeByName, keycodeLabel } from '../zmk/keycodes';

const original = chocoKey.files.original['config/Choco-Key.keymap'];
const studio = chocoKey.files.studio['config/Choco-Key.keymap'];

describe('keycodes', () => {
  it('ZMK keys.h と同じ値', () => {
    expect(keycodeByName('A')!.value).toBe(0x070004);
    expect(keycodeByName('EXCL')!.value).toBe(0x02 << 24 | 0x07001e);
    expect(keycodeByName('C_VOL_UP')!.value).toBe(0x0c00e9);
  });
  it('修飾キー付きの表記', () => {
    expect(formatKeycode((0x03 << 24 | 0x070006) >>> 0)).toBe('LC(LS(C))');
    expect(formatKeycode(0x070035 | 0x04 << 24)).toBe('LA(GRAVE)');
    expect(keycodeLabel(keycodeByName('AT')!.value, 'jis')).toBe('"');
    expect(keycodeLabel(keycodeByName('AT')!.value, 'us')).toBe('@');
  });
});

describe('Choco-Key.keymap の解析', () => {
  const parsed = parseKeymap(original);
  const layers = layersFromParsed(parsed);
  it('5 レイヤー × 42 キー', () => {
    expect(layers).toHaveLength(5);
    for (const l of layers) expect(l.bindings).toHaveLength(42);
    expect(parsed.reservedLayers).toHaveLength(0);
  });
  it('各種バインディング', () => {
    const base = layers[0].bindings;
    expect(base[0]).toEqual({ b: 'kp', p: [0x070014] }); // Q
    expect(base[31]).toEqual({ b: 'mt', p: [0x070046, 0x0700e3] }); // &mt PSCRN LWIN
    expect(base[34]).toEqual({ b: 'lt', p: [1, (0x04 << 24 | 0x070035) >>> 0] }); // &lt 1 LA(GRAVE)
    expect(base[41]).toEqual({ b: 'lt', p: [4, 0x070029] });
    expect(layers[1].bindings[4]).toEqual({ b: 'kp', p: [(0x03 << 24 | 0x070006) >>> 0] });
    const l4 = layers[4].bindings;
    expect(l4[0]).toEqual({ b: 'bt', p: [3, 4] });
    expect(l4[10]).toEqual({ b: 'bt', p: [4, 0] });
    expect(l4[14]).toEqual({ b: 'ind_bat', p: [] });
    expect(l4[35]).toEqual({ b: 'bootloader', p: [] });
  });
  it('カスタムビヘイビア', () => {
    const labels = parsed.customBehaviors.map((b) => b.label);
    expect(labels).toEqual(expect.arrayContaining(['to_layer_0', 'lt_to_layer_0']));
    const lt0 = parsed.customBehaviors.find((b) => b.label === 'lt_to_layer_0')!;
    expect(lt0.params).toEqual(['layer', 'keycode']);
    expect(lt0.aliases).toContain('LAYER_TAP_TO_0');
    expect(parsed.scrollVal).toBe(100);
  });
  it('無変更でエクスポートすると元のファイルと完全一致', () => {
    const r = exportKeymap(original, layers, chocoKey);
    expect(r.text).toBe(original);
  });
  it('Studio 版 (OS 別 25 レイヤー) キーマップ', () => {
    const p = parseKeymap(studio);
    expect(p.layers).toHaveLength(25);
    expect(p.reservedLayers).toHaveLength(0);
    const ls = layersFromParsed(p);
    expect(ls[4].bindings[5]).toEqual({ b: 'studio_unlock', p: [] });
    // 各 OS の Layer 4 に OS 切替キー
    expect(ls[4].bindings[15]).toEqual({ b: 'os_sel', p: [0, 0] });
    expect(ls[9].bindings[16]).toEqual({ b: 'os_sel', p: [1, 5] });
    expect(ls[24].bindings[19]).toEqual({ b: 'os_sel', p: [4, 20] });
    // macOS Layer 0 のレイヤー参照は macOS 内 (5〜9) を指す
    expect(ls[5].bindings[34]).toEqual({ b: 'lt', p: [6, (0x04 << 24 | 0x070035) >>> 0] });
    expect(ls[5].bindings[41]).toEqual({ b: 'lt', p: [9, 0x070029] });
    // エンコーダー
    expect(ls[0].sensors).toHaveLength(2);
    expect(ls[0].sensors![0].cw).toEqual({ b: 'msc', p: [100] });
    // 無変更なら完全一致
    expect(exportKeymap(studio, ls, chocoKey, [], { osMacros: true }).text).toBe(studio);
  });
});

describe('エクスポート', () => {
  const parsed = parseKeymap(original);
  it('変更したキーだけが書き換わり、再解析すると同じ内容', () => {
    const layers = layersFromParsed(parsed);
    layers[0].bindings[0] = { b: 'mt', p: [keycodeByName('LSHFT')!.value, keycodeByName('Z')!.value] };
    layers[2].bindings[1] = { b: 'bt', p: [3, 2] };
    layers[3].name = 'Fn';
    const r = exportKeymap(original, layers, chocoKey);
    expect(r.text).toContain('&mt LSHFT Z');
    expect(r.text).toContain('&bt BT_SEL 2');
    expect(r.text).toContain('display-name = "Fn";');
    // 変更していない部分は維持される
    expect(r.text).toContain('&lt 1 LA(GRAVE)');
    expect(r.text).toContain('#define ZMK_POINTING_DEFAULT_SCRL_VAL 100');
    const again = layersFromParsed(parseKeymap(r.text));
    expect(again).toEqual(layers);
  });
  it('レイヤーの追加・削除とレイヤー参照の付け替え', () => {
    const layers = layersFromParsed(parsed);
    const extra: Layer = { id: 9, name: 'Mouse', bindings: Array.from({ length: 42 }, () => ({ b: 'trans', p: [] as number[] })) };
    extra.bindings[0] = { b: 'msc', p: [100] }; // SCRL_UP (値 100)
    layers.push(extra);
    layers[0].bindings[0] = { b: 'mo', p: [9] };
    const r = exportKeymap(original, layers, chocoKey);
    expect(r.text).toContain('&mo 5');
    expect(r.text).toContain('display-name = "Mouse"');
    expect(r.text).toContain('&msc SCRL_UP');
    const again = parseKeymap(r.text);
    expect(again.layers).toHaveLength(6);
    // レイヤーを削除
    const fewer = layersFromParsed(parsed).slice(0, 4);
    const r2 = exportKeymap(original, fewer, chocoKey);
    expect(parseKeymap(r2.text).layers).toHaveLength(4);
    expect(r2.warnings.some((w) => w.includes('存在しないレイヤー'))).toBe(true); // &lt 4 ESC が残っている
  });
  it('マクロを出力できる', () => {
    const layers = layersFromParsed(parsed);
    layers[0].bindings[1] = { b: 'hello', p: [] };
    const r = exportKeymap(original, layers, chocoKey, [
      { label: 'hello', name: 'Hello', keys: ['H', 'I'].map((n) => keycodeByName(n)!.value), waitMs: 30, tapMs: 30 },
    ]);
    expect(r.text).toContain('hello: hello {');
    expect(r.text).toContain('bindings = <&macro_tap &kp H &kp I>;');
    const p = parseKeymap(r.text);
    expect(p.customBehaviors.map((b) => b.label)).toContain('hello');
  });
  it('formatBinding', () => {
    const reg = behaviorRegistry();
    expect(formatBinding({ b: 'bt', p: [0, 0] }, { behaviors: reg })).toBe('&bt BT_CLR');
    expect(formatBinding({ b: 'rgb_ug', p: [14, (120 << 16) | (50 << 8) | 80] }, { behaviors: reg })).toBe('&rgb_ug RGB_COLOR_HSB(120, 50, 80)');
    expect(formatBinding({ b: 'mmv', p: [0xfda80000] }, { behaviors: reg })).toBe('&mmv MOVE_LEFT');
  });
});
