/**
 * 実機で報告された不具合の再発防止テスト
 *  1. エンコーダーに上下 / 左右スクロールを設定すると「パラメータが不正です」になる
 *  2. 適用中に応答が遅れて接続が切れると、再接続しても通信できなくなる
 */
import { describe, expect, it } from 'vitest';
import { chocoKey } from '../keyboards/choco-key';
import { StudioDevice } from '../device/studio';
import { StudioSimulator } from '../device/simulator';
import { applyToDevice, buildBehaviorMap, layersFromDevice } from '../device/sync';
import { deviceWrappers } from '../device/wrappers';
import { behaviorRegistry, parseKeymap } from '../zmk/keymap';
import { BUILTIN_BEHAVIORS, mouseScrolls } from '../zmk/behaviors';

const parsed = parseKeymap(chocoKey.files.studio[chocoKey.keymapPath]);
const known = [...BUILTIN_BEHAVIORS, ...parsed.customBehaviors];
const registry = behaviorRegistry(parsed.customBehaviors);
const scroll = mouseScrolls(parsed.scrollVal);

function open(flash: { v: string | null }, opts: { hangOn?: string } = {}) {
  const sim = new StudioSimulator(chocoKey, { ...opts, storage: { load: () => flash.v, save: (v) => (flash.v = v), clear: () => (flash.v = null) } });
  const dev = StudioDevice.fromTransport(sim.transport(), 'usb', {});
  return { sim, dev };
}

describe('不具合 1: エンコーダーのスクロール設定', () => {
  it('ZMK v0.2.1 は &msc のパラメータを受け付けないので、代わりのマクロに変換して書き込む', async () => {
    const flash = { v: null as string | null };
    const { sim, dev } = open(flash);
    const map = buildBehaviorMap(await dev.listBehaviors(), known, deviceWrappers(parsed.scrollVal));
    expect(map.wrappers.map((w) => w.label)).toContain('cf_scrl_up');
    const layers = layersFromDevice(await dev.getKeymap(), map, registry);
    // 上下スクロール (右エンコーダー) と左右スクロール (左エンコーダー) を入れ替えて設定
    layers[0].bindings[42] = { b: 'msc', p: [scroll[1].value] };
    layers[0].bindings[43] = { b: 'msc', p: [scroll[0].value] };
    layers[0].bindings[44] = { b: 'msc', p: [scroll[2].value] };
    layers[0].bindings[45] = { b: 'msc', p: [scroll[3].value] };
    layers[3].bindings[0] = { b: 'mkp', p: [1] }; // キーにも左クリック
    layers[3].bindings[1] = { b: 'mmv', p: [0xfda80000] }; // マウス左移動
    const res = await applyToDevice(dev, layers, map, registry, () => {});
    expect(res.changed).toBe(6);
    expect(sim.unsaved).toBe(false);
    // 読み直すとアプリの表記 (&msc …) に戻る
    const back = layersFromDevice(await dev.getKeymap(), map, registry);
    expect(back[0].bindings.slice(42, 46)).toEqual(layers[0].bindings.slice(42, 46));
    expect(back[3].bindings[0]).toEqual({ b: 'mkp', p: [1] });
  });

  it('代わりのマクロが無い古いファームウェアでは、書き込む前に分かりやすいエラーにする', async () => {
    const { sim, dev } = open({ v: null });
    const map = buildBehaviorMap(await dev.listBehaviors(), known); // 代わりのマクロ無し
    const layers = layersFromDevice(await dev.getKeymap(), map, registry);
    layers[0].bindings[42] = { b: 'msc', p: [scroll[1].value] };
    await expect(applyToDevice(dev, layers, map, registry, () => {})).rejects.toThrow(/ZMK Studio から書き込めません/);
    expect(sim.unsaved).toBe(false);
  });
});

describe('不具合 2: 接続が切れたあと再接続できない', () => {
  it('保存の応答が無くてタイムアウトしても、再接続すれば通信できる', async () => {
    const flash = { v: null as string | null };
    const a = open(flash, { hangOn: 'keymap.saveChanges' });
    a.dev.saveTimeoutMs = 300;
    const map = buildBehaviorMap(await a.dev.listBehaviors(), known, deviceWrappers(parsed.scrollVal));
    const layers = layersFromDevice(await a.dev.getKeymap(), map, registry);
    layers[0].bindings[0] = { b: 'kp', p: [0x070005] };
    await expect(applyToDevice(a.dev, layers, map, registry, () => {})).rejects.toThrow(/応答がありませんでした/);
    expect(a.dev.isClosed).toBe(true);
    // 新しい接続 (ケーブルの抜き差し後) では問題なく通信できる (以前は公式クライアントの全体ロックが残って止まっていた)
    const b = open(flash);
    await expect(b.dev.getDeviceInfo()).resolves.toMatchObject({ name: 'Choco-Key' });
    const map2 = buildBehaviorMap(await b.dev.listBehaviors(), known, deviceWrappers(parsed.scrollVal));
    await applyToDevice(b.dev, layers, map2, registry, () => {});
    expect(layersFromDevice(await b.dev.getKeymap(), map2, registry)[0].bindings[0]).toEqual({ b: 'kp', p: [0x070005] });
  });

  it('遅れて届いた古い応答は読み飛ばす', async () => {
    const { dev } = open({ v: null });
    const [x, y] = await Promise.all([dev.getDeviceInfo(), dev.getLockState()]);
    expect(x.name).toBe('Choco-Key');
    expect(y).toBeDefined();
  });
});
