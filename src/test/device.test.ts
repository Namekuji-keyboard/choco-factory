import { describe, expect, it } from 'vitest';
import { chocoKey } from '../keyboards/choco-key';
import { StudioDevice, LockState, LockedError } from '../device/studio';
import { StudioSimulator } from '../device/simulator';
import { applyToDevice, buildBehaviorMap, layersFromDevice, planApply } from '../device/sync';
import { behaviorRegistry, layersFromParsed, parseKeymap } from '../zmk/keymap';
import { BUILTIN_BEHAVIORS } from '../zmk/behaviors';
import { keycodeByName } from '../zmk/keycodes';

const parsed = parseKeymap(chocoKey.files.studio[chocoKey.keymapPath]);
const known = [...BUILTIN_BEHAVIORS, ...parsed.customBehaviors];
const registry = behaviorRegistry(parsed.customBehaviors);

async function setup(opts = {}) {
  let flash: string | null = null;
  const sim = new StudioSimulator(chocoKey, { ...opts, storage: { load: () => flash, save: (v) => (flash = v), clear: () => (flash = null) } });
  const locks: LockState[] = [];
  const dev = StudioDevice.fromTransport(sim.transport(), 'usb', { onLockStateChanged: (s) => locks.push(s) });
  return { sim, dev, locks };
}

describe('ZMK Studio RPC (シミュレーター)', () => {
  it('デバイス情報・ビヘイビア・キーマップを取得できる', async () => {
    const { dev } = await setup();
    const info = await dev.getDeviceInfo();
    expect(info.name).toBe('Choco-Key');
    const map = buildBehaviorMap(await dev.listBehaviors(), known);
    expect(map.byLabel.get('kp')).toBeDefined();
    expect(map.byLabel.get('ind_bat')).toBeDefined();
    expect(map.byLabel.get('lt_to_layer_0')).toBeDefined();
    const km = await dev.getKeymap();
    expect(km.layers).toHaveLength(25);
    expect(km.availableLayers).toBe(0);
    expect(map.byLabel.get('os_sel')).toBeDefined();
    const layers = layersFromDevice(km, map, registry);
    // ファイルから読んだ内容と一致
    const fromFile = layersFromParsed(parsed);
    expect(layers.map((l) => l.bindings)).toEqual(fromFile.map((l) => l.bindings));
    expect(planApply(fromFile, layers).bindings).toHaveLength(0);
    const phys = await dev.getPhysicalLayouts();
    expect(phys?.layouts[0].keys).toHaveLength(42);
    await dev.disconnect();
  });

  it('ロック中はキーマップを取得できず、アンロック通知を受け取れる', async () => {
    const { sim, dev, locks } = await setup({ locked: true });
    expect(await dev.getLockState()).toBe(LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED);
    await expect(dev.getKeymap()).rejects.toBeInstanceOf(LockedError);
    sim.pressUnlock();
    await new Promise((r) => setTimeout(r, 20));
    expect(locks).toContain(LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED);
    await expect(dev.getKeymap()).resolves.toBeDefined();
  });

  it('編集内容を書き込み、フラッシュに保存し、電源再投入後も維持される', async () => {
    const { sim, dev } = await setup();
    const map = buildBehaviorMap(await dev.listBehaviors(), known);
    const layers = layersFromDevice(await dev.getKeymap(), map, registry);
    layers[0].bindings[0] = { b: 'mt', p: [keycodeByName('LSHFT')!.value, keycodeByName('Z')!.value] };
    layers[6].bindings[5] = { b: 'mo', p: [8] }; // macOS Layer 1 → macOS Layer 3
    layers[7].name = 'Mac Num';
    layers[24].bindings[15] = { b: 'os_sel', p: [0, 2] }; // OS 切替 (BT 0 + Windows Layer 2)
    layers[20].bindings[0] = { b: 'mkp', p: [1] };
    const progress: string[] = [];
    const res = await applyToDevice(dev, layers, map, registry, (p) => progress.push(p.message));
    expect(res.changed).toBe(5);
    expect(progress.at(-1)).toBe('保存が完了しました');
    expect(sim.unsaved).toBe(false);
    sim.powerCycle();
    const after = layersFromDevice(await dev.getKeymap(), map, registry);
    expect(after).toHaveLength(25);
    expect(after[0].bindings[0]).toEqual(layers[0].bindings[0]);
    expect(after[6].bindings[5]).toEqual({ b: 'mo', p: [8] });
    expect(after[7].name).toBe('Mac Num');
    expect(after[24].bindings[15]).toEqual({ b: 'os_sel', p: [0, 2] });
    expect(after[20].bindings[0]).toEqual({ b: 'mkp', p: [1] });
    // 他の OS には影響しない
    expect(after[5].bindings[0]).toEqual(layers[5].bindings[0]);
    expect(after[11].bindings[5]).toEqual(layers[11].bindings[5]);
    // 2回目は差分なし
    const again = await applyToDevice(dev, res.layers, map, registry, () => {});
    expect(again.changed).toBe(0);
  });

  it('旧ファームウェア (5 レイヤー + 予備 3) には 25 レイヤーを書き込めない', async () => {
    let flash: string | null = null;
    const old = chocoKey.files.original[chocoKey.keymapPath];
    const sim = new StudioSimulator(chocoKey, { keymapSource: old, storage: { load: () => flash, save: (v) => (flash = v), clear: () => (flash = null) } });
    const dev = StudioDevice.fromTransport(sim.transport(), 'usb', {});
    const map = buildBehaviorMap(await dev.listBehaviors(), known);
    const deviceLayers = layersFromDevice(await dev.getKeymap(), map, registry);
    expect(deviceLayers).toHaveLength(5);
    const project = layersFromParsed(parsed);
    await expect(applyToDevice(dev, project, map, registry, () => {})).rejects.toThrow(/レイヤー数/);
    expect(sim.unsaved).toBe(false);
  });

  it('ファームウェアに無いビヘイビアは書き込む前にエラー', async () => {
    const { sim, dev } = await setup();
    const map = buildBehaviorMap(await dev.listBehaviors(), known);
    const layers = layersFromDevice(await dev.getKeymap(), map, registry);
    layers[0].bindings[0] = { b: 'my_new_macro', p: [] };
    await expect(applyToDevice(dev, layers, map, registry, () => {})).rejects.toThrow(/my_new_macro/);
    expect(sim.unsaved).toBe(false);
  });
});
