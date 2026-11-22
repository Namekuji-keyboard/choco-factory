/**
 * デバイス (ZMK Studio) のキーマップと、このアプリのキーマップモデルの相互変換・同期。
 *
 * ZMK Studio はビヘイビアを「デバイス内 ID + display-name」で扱い、devicetree のラベル (kp, mt…) は返しません。
 * そのため display-name (およびノード名 / label プロパティ) でラベルと対応付けます。
 */
import type { Binding, Layer } from '../model/types';
import type { BehaviorDef, ParamKind } from '../zmk/behaviors';
import { bindingsEqual } from '../zmk/keymap';
import type { GetBehaviorDetailsResponse, Keymap, StudioDevice } from './studio';
import { DeviceError } from './studio';
import { ZMK_STUDIO_UNSUPPORTED, fromDeviceBinding, toDeviceBinding, type DeviceWrapper } from './wrappers';

export interface DeviceBehavior {
  id: number;
  displayName: string;
  /** 対応するラベル (不明な場合は undefined) */
  label?: string;
  /** デバイスのメタデータから推定したパラメータ数 */
  paramCount: number;
  details: GetBehaviorDetailsResponse;
}

export interface BehaviorMap {
  behaviors: DeviceBehavior[];
  byId: Map<number, DeviceBehavior>;
  byLabel: Map<string, DeviceBehavior>;
  /** ZMK Studio で書き込めないビヘイビアの代わりに使うマクロ (キーボードに搭載されているもの) */
  wrappers: DeviceWrapper[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** デバイスのメタデータから推定したパラメータ種別 */
export function paramKindsFromMetadata(d: GetBehaviorDetailsResponse): ParamKind[] {
  const set = d.metadata[0];
  if (!set) return [];
  const kindOf = (descs: GetBehaviorDetailsResponse['metadata'][number]['param1']): ParamKind | null => {
    if (!descs.length || descs.every((x) => x.nil)) return null;
    if (descs.some((x) => x.hidUsage)) return 'keycode';
    if (descs.some((x) => x.layerId)) return 'layer';
    return 'number';
  };
  const k1 = kindOf(set.param1);
  const k2 = kindOf(set.param2);
  if (!k1) return [];
  return k2 ? [k1, k2] : [k1];
}

export function buildBehaviorMap(details: GetBehaviorDetailsResponse[], known: BehaviorDef[], wrappers: DeviceWrapper[] = []): BehaviorMap {
  const behaviors: DeviceBehavior[] = details.map((d) => {
    const n = norm(d.displayName);
    // 英数字を含まない名前 (日本語のみなど) は照合できないので対応付けない
    const def = !n
      ? undefined
      : (known.find((k) => norm(k.displayName) === n) ?? known.find((k) => k.aliases?.some((a) => norm(a) === n)) ?? known.find((k) => norm(k.label) === n));
    const metaParams = paramKindsFromMetadata(d).length;
    return { id: d.id, displayName: d.displayName, label: def?.label, paramCount: def ? def.params.length : metaParams, details: d };
  });
  const byId = new Map(behaviors.map((b) => [b.id, b]));
  const byLabel = new Map<string, DeviceBehavior>();
  for (const b of behaviors) if (b.label && !byLabel.has(b.label)) byLabel.set(b.label, b);
  return { behaviors, byId, byLabel, wrappers: wrappers.filter((w) => byLabel.has(w.label)) };
}

/** ラベルが分からないデバイス上のビヘイビア用の仮ラベル */
export const unknownLabel = (b: DeviceBehavior) => `__device_${b.id}`;

export function deviceBindingToBinding(
  db: { behaviorId: number; param1: number; param2: number },
  map: BehaviorMap,
  registry: Map<string, BehaviorDef>,
): Binding {
  const b = map.byId.get(db.behaviorId);
  if (!b) return { b: `__device_${db.behaviorId}`, p: [db.param1 >>> 0, db.param2 >>> 0] };
  const label = b.label ?? unknownLabel(b);
  const count = b.label ? (registry.get(b.label)?.params.length ?? b.paramCount) : b.paramCount;
  const p = [db.param1 >>> 0, db.param2 >>> 0].slice(0, count);
  return fromDeviceBinding({ b: label, p }, map.wrappers ?? []);
}

export function bindingToDevice(binding0: Binding, map: BehaviorMap): { behaviorId: number; param1: number; param2: number } {
  const binding = toDeviceBinding(binding0, map.wrappers ?? []);
  if (ZMK_STUDIO_UNSUPPORTED.has(binding.b) && binding.p.some((v) => v !== 0)) {
    throw new DeviceError(
      map.wrappers?.length
        ? `&${binding.b} ${binding.p.join(' ')} は ZMK Studio から書き込めない値です (ZMK v0.2.1 の制限)。用意されているスクロール / マウス移動 / クリックの値を選んでください。`
        : `&${binding.b} (マウス操作) は ZMK v0.2.1 の ZMK Studio からは直接書き込めないため、ファームウェアの代わりのマクロ (cf_scrl_up など) を使いますが、接続中のキーボードには見つかりませんでした。「ファイル」→「ZMK 設定一式 (ZIP)」を出力してビルドし、右手用の .uf2 を書き込んでから、もう一度接続してください。`,
    );
  }
  if (binding.raw !== undefined) {
    throw new DeviceError(`&${binding.b} ${binding.raw} はパラメータを数値に変換できないため、キーボードに書き込めません`);
  }
  let b = map.byLabel.get(binding.b);
  if (!b && binding.b.startsWith('__device_')) b = map.byId.get(Number(binding.b.slice(9)));
  if (!b) {
    throw new DeviceError(`ビヘイビア &${binding.b} はキーボードのファームウェアに含まれていません (ファームウェアの再ビルドが必要です)`);
  }
  return { behaviorId: b.id, param1: (binding.p[0] ?? 0) >>> 0, param2: (binding.p[1] ?? 0) >>> 0 };
}

export function layersFromDevice(keymap: Keymap, map: BehaviorMap, registry: Map<string, BehaviorDef>): Layer[] {
  return keymap.layers.map((l, i) => ({
    id: l.id,
    name: l.name || `Layer ${i}`,
    bindings: l.bindings.map((b) => deviceBindingToBinding(b, map, registry)),
  }));
}

export interface ApplyPlan {
  addLayers: number;
  removeLayers: number[]; // デバイス上のインデックス (後ろから)
  renames: { layerIndex: number; name: string }[];
  bindings: { layerIndex: number; position: number; binding: Binding }[];
}

/** プロジェクトとデバイスの差分 */
export function planApply(project: Layer[], device: Layer[]): ApplyPlan {
  const plan: ApplyPlan = { addLayers: 0, removeLayers: [], renames: [], bindings: [] };
  if (project.length > device.length) plan.addLayers = project.length - device.length;
  for (let i = device.length - 1; i >= project.length; i--) plan.removeLayers.push(i);
  project.forEach((l, i) => {
    const d = device[i];
    // デバイス側で名前が空のレイヤーは「Layer N」と表示しているので、その場合は送らない
    const shown = d?.name || `Layer ${i}`;
    if (l.name !== shown) plan.renames.push({ layerIndex: i, name: l.name });
    l.bindings.forEach((b, pos) => {
      const db = d?.bindings[pos];
      if (!db || !bindingsEqual(b, db)) plan.bindings.push({ layerIndex: i, position: pos, binding: b });
    });
  });
  return plan;
}

export function planSize(p: ApplyPlan) {
  return p.addLayers + p.removeLayers.length + p.renames.length + p.bindings.length;
}

export interface ApplyProgress {
  done: number;
  total: number;
  message: string;
}

/**
 * プロジェクトの内容をデバイスに書き込み、フラッシュに保存する。
 * 戻り値: デバイスで割り当てられたレイヤー ID に合わせて更新したレイヤー
 */
export async function applyToDevice(
  dev: StudioDevice,
  project: Layer[],
  map: BehaviorMap,
  registry: Map<string, BehaviorDef>,
  onProgress: (p: ApplyProgress) => void,
): Promise<{ layers: Layer[]; changed: number }> {
  onProgress({ done: 0, total: 1, message: 'キーボードの現在のキーマップを確認しています…' });
  let keymap = await dev.getKeymap();
  let deviceLayers = layersFromDevice(keymap, map, registry);

  if (project.length > deviceLayers.length && project.length - deviceLayers.length > keymap.availableLayers) {
    throw new DeviceError(
      `レイヤー数 (${project.length}) がキーボードのファームウェアの上限 (${deviceLayers.length + keymap.availableLayers}) を超えています。OS 別 25 レイヤー版のファームウェアを書き込んでください (「ファイル」→「ZMK 設定一式 (ZIP)」)。`,
    );
  }
  // 先に、書き込むキーがすべて書き込めるか確認 (途中で失敗して中途半端な状態にならないように)
  for (const c of planApply(project, deviceLayers).bindings) bindingToDevice(c.binding, map);
  const tooLong = project.find((l) => new TextEncoder().encode(l.name).length > keymap.maxLayerNameLength);
  if (tooLong && keymap.maxLayerNameLength > 0) {
    throw new DeviceError(`レイヤー名「${tooLong.name}」が長すぎます (最大 ${keymap.maxLayerNameLength} バイト)`);
  }

  // レイヤー ID の対応 (プロジェクト ID → デバイス ID)
  const idMap = new Map<number, number>();
  project.forEach((l, i) => {
    if (i < deviceLayers.length) idMap.set(l.id, deviceLayers[i].id);
  });

  const plan0 = planApply(project, deviceLayers);
  let done = 0;
  const total = Math.max(1, planSize(plan0)) + 1;
  const step = (message: string) => onProgress({ done: ++done, total, message });

  for (const idx of plan0.removeLayers) {
    await dev.removeLayer(idx);
    step(`レイヤー ${idx} を削除しています…`);
  }
  for (let i = 0; i < plan0.addLayers; i++) {
    const added = await dev.addLayer();
    idMap.set(project[deviceLayers.length + i].id, added.id);
    step('レイヤーを追加しています…');
  }
  if (plan0.addLayers || plan0.removeLayers.length) {
    keymap = await dev.getKeymap();
  }

  // レイヤー参照 (mo/lt/to など) をデバイスのレイヤー ID に置き換え
  const remapped: Layer[] = project.map((l) => ({
    ...l,
    id: idMap.get(l.id) ?? l.id,
    bindings: l.bindings.map((b) => {
      const def = registry.get(b.b);
      if (!def || !def.params.includes('layer')) return b;
      return { ...b, p: b.p.map((v, i) => (def.params[i] === 'layer' ? (idMap.get(v) ?? v) : v)) };
    }),
  }));
  deviceLayers = layersFromDevice(keymap, map, registry);
  const plan = planApply(remapped, deviceLayers);

  for (const r of plan.renames) {
    await dev.setLayerName(deviceLayers[r.layerIndex].id, r.name);
    step(`レイヤー名を変更しています: ${r.name}`);
  }
  for (const b of plan.bindings) {
    await dev.setLayerBinding(deviceLayers[b.layerIndex].id, b.position, bindingToDevice(b.binding, map));
    step(`キーを書き込んでいます (${remapped[b.layerIndex].name} / キー ${b.position + 1})`);
  }

  onProgress({ done: total - 1, total, message: 'フラッシュに保存しています…' });
  if (planSize(plan) + plan0.addLayers + plan0.removeLayers.length > 0 || (await dev.checkUnsavedChanges())) {
    await dev.saveChanges();
  }

  // 書き込み結果の検証
  const verify = layersFromDevice(await dev.getKeymap(), map, registry);
  const diff = planApply(remapped, verify);
  if (diff.bindings.length || diff.addLayers || diff.removeLayers.length) {
    throw new DeviceError(`書き込み後の確認で ${diff.bindings.length} 件の不一致が見つかりました。もう一度「キーボードに適用」を実行してください。`);
  }
  onProgress({ done: total, total, message: '保存が完了しました' });
  return { layers: remapped, changed: planSize(plan) + plan0.addLayers + plan0.removeLayers.length };
}
