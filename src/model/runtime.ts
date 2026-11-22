/**
 * 即時編集 (UF2 の書き込み不要) のエンコーダー・マクロ・コンボ。
 *
 * ファームウェア (firmware/choco-key/studio/src の Choco Factory モジュール) は、物理キーの後ろに
 * 「仮想キー位置」を持ち、その割り当てを実行します。仮想キー位置の割り当ては通常のキーと同じく
 * ZMK Studio の set_layer_binding / save_changes で書き込み・フラッシュ保存できるため、
 * アプリはキーの割り当てと同じ仕組みで即時に変更・読み込み・検証できます。
 *
 *  エンコーダー: sensor-bindings = <&enc_vk 42 43>, <&enc_vk 44 45> (固定)。
 *    回すと仮想キー 42〜45 の「現在のレイヤーの」割り当てを押す → レイヤーごとに設定でき、透過も使える
 *  マクロ: &rtm0〜&rtm5 = &vkey 46〜93 を 8 個ずつ順番にタップ (固定)。中身 (レイヤー 0 の 46〜93) を変更
 *  コンボ: レイヤー 0 の 94〜109 に &rt_combo <p1> <p2> (キー・判定時間・レイヤー)、110〜125 に出力
 *
 * ここでのエンコードは firmware/choco-key/studio/src/runtime_combo.c と一致させること。
 */
import type { Binding, ComboDef, KeyboardDefinition, Layer, OsLayout, Project, RuntimeLayout } from './types';
import { bindingsEqual } from '../zmk/keymap';

export const TRANS: Binding = { b: 'trans', p: [] };
export const NONE: Binding = { b: 'none', p: [] };

/** センサー s (0 = 右, 1 = 左) の回転方向のキー位置 */
export const encoderPosition = (rt: RuntimeLayout, sensor: number, dir: 'cw' | 'ccw') => rt.encoderBase + sensor * 2 + (dir === 'ccw' ? 1 : 0);
export const macroStepPosition = (rt: RuntimeLayout, slot: number, step: number) => rt.macroBase + slot * rt.macroSteps + step;
export const macroBehaviorLabel = (rt: RuntimeLayout, slot: number) => `${rt.macroBehaviorPrefix}${slot}`;
export const macroSlotOf = (rt: RuntimeLayout, label: string) => {
  const m = new RegExp(`^${rt.macroBehaviorPrefix}(\\d+)$`).exec(label);
  const n = m ? Number(m[1]) : -1;
  return n >= 0 && n < rt.macroSlots ? n : -1;
};

/** レイヤー 0 だけで設定する位置 (マクロの中身・コンボ)。他のレイヤーは透過にしておく */
export function isGlobalPosition(rt: RuntimeLayout, pos: number): boolean {
  return pos >= rt.macroBase && pos < rt.total;
}

export type PositionKind = 'physical' | 'encoder' | 'macro' | 'comboConfig' | 'comboOutput';
export function positionKind(rt: RuntimeLayout | undefined, pos: number): PositionKind {
  if (!rt || pos < rt.encoderBase) return 'physical';
  if (pos < rt.macroBase) return 'encoder';
  if (pos < rt.comboConfigBase) return 'macro';
  if (pos < rt.comboOutputBase) return 'comboConfig';
  return 'comboOutput';
}

export function positionLabel(rt: RuntimeLayout | undefined, pos: number): string {
  const k = positionKind(rt, pos);
  if (!rt || k === 'physical') return `キー #${pos + 1}`;
  if (k === 'encoder') {
    const o = pos - rt.encoderBase;
    return `${o < 2 ? '右' : '左'}エンコーダー ${o % 2 ? '反時計回り' : '時計回り'}`;
  }
  if (k === 'macro') {
    const o = pos - rt.macroBase;
    return `マクロ ${Math.floor(o / rt.macroSteps) + 1} の ${(o % rt.macroSteps) + 1} 番目`;
  }
  if (k === 'comboConfig') return `コンボ ${pos - rt.comboConfigBase + 1} の設定`;
  return `コンボ ${pos - rt.comboOutputBase + 1} の動作`;
}

// ---------------------------------------------------------------------------
// マクロ
// ---------------------------------------------------------------------------

export interface RuntimeMacro {
  slot: number;
  name: string;
  /** 実行するステップ (末尾の「なし」は省略) */
  steps: Binding[];
}

export function readMacros(project: Pick<Project, 'layers' | 'runtimeNames'>, rt: RuntimeLayout): RuntimeMacro[] {
  const l0 = project.layers[0];
  return Array.from({ length: rt.macroSlots }, (_, slot) => {
    const steps = Array.from({ length: rt.macroSteps }, (_, i) => l0?.bindings[macroStepPosition(rt, slot, i)] ?? NONE);
    let n = steps.length;
    while (n > 0 && (steps[n - 1].b === 'none' || steps[n - 1].b === 'trans')) n--;
    return { slot, name: project.runtimeNames?.macros[slot] || `マクロ ${slot + 1}`, steps: steps.slice(0, n) };
  });
}

export function writeMacroSteps(layers: Layer[], rt: RuntimeLayout, slot: number, steps: Binding[]): Layer[] {
  if (steps.length > rt.macroSteps) throw new Error(`マクロのステップは ${rt.macroSteps} 個までです`);
  return layers.map((l, li) => {
    const bindings = [...l.bindings];
    for (let i = 0; i < rt.macroSteps; i++) {
      bindings[macroStepPosition(rt, slot, i)] = li === 0 ? (steps[i] ? { ...steps[i], p: [...steps[i].p] } : { ...NONE }) : { ...TRANS };
    }
    return { ...l, bindings };
  });
}

// ---------------------------------------------------------------------------
// コンボ
// ---------------------------------------------------------------------------

const MASK31 = 0x7fffffff;

export interface ComboConfig {
  positions: number[];
  timeoutMs: number;
  /** 有効なレイヤーグループ (OS) とグループ内レイヤー。空 = すべて */
  groups: number[];
  layersInGroup: number[];
}

/** &rt_combo のパラメータにエンコード (runtime_combo.c と同じ形式) */
export function encodeComboConfig(c: ComboConfig): [number, number] {
  let p1 = 0;
  let p2 = 0;
  for (const pos of c.positions) {
    if (pos < 0 || pos > 41) throw new Error(`コンボに使えるのは物理キー (1〜42) だけです (キー #${pos + 1})`);
    if (pos < 31) p1 |= 1 << pos;
    else p2 |= 1 << (pos - 31);
  }
  const timeout = Math.max(1, Math.min(1023, Math.round(c.timeoutMs)));
  p2 |= timeout << 11;
  for (const g of c.groups) p2 |= (1 << g) << 21;
  for (const l of c.layersInGroup) p2 |= (1 << l) << 26;
  return [(p1 & MASK31) >>> 0, (p2 & MASK31) >>> 0];
}

export function decodeComboConfig(p1: number, p2: number): ComboConfig | null {
  const positions: number[] = [];
  for (let i = 0; i < 31; i++) if (p1 & (1 << i)) positions.push(i);
  for (let i = 0; i < 11; i++) if (p2 & (1 << i)) positions.push(31 + i);
  const timeoutMs = (p2 >>> 11) & 0x3ff;
  const groups = [0, 1, 2, 3, 4].filter((g) => (p2 >>> 21) & (1 << g));
  const layersInGroup = [0, 1, 2, 3, 4].filter((l) => (p2 >>> 26) & (1 << l));
  if (positions.length < 2 || timeoutMs === 0) return null;
  return { positions, timeoutMs, groups, layersInGroup };
}

/** UI のコンボ (ComboDef) ↔ スロット。ComboDef.layers は ZMK のレイヤー番号 */
export function readCombos(project: Pick<Project, 'layers' | 'runtimeNames'>, rt: RuntimeLayout): ComboDef[] {
  const l0 = project.layers[0];
  const out: ComboDef[] = [];
  for (let n = 0; n < rt.comboSlots; n++) {
    const cfg = l0?.bindings[rt.comboConfigBase + n];
    if (!cfg || cfg.b !== rt.comboBehavior || cfg.p.length !== 2) continue;
    const c = decodeComboConfig(cfg.p[0], cfg.p[1]);
    if (!c) continue;
    const per = rt.layersPerGroup;
    const groups = c.groups.length ? c.groups : [];
    const rels = c.layersInGroup.length ? c.layersInGroup : [];
    let layers: number[] = [];
    if (groups.length || rels.length) {
      const gs = groups.length ? groups : [0, 1, 2, 3, 4];
      const rs = rels.length ? rels : Array.from({ length: per }, (_, i) => i);
      layers = gs.flatMap((g) => rs.map((r) => g * per + r)).filter((i) => i < project.layers.length);
    }
    out.push({
      id: `slot-${n}`,
      name: project.runtimeNames?.combos[n] || `combo_${n + 1}`,
      positions: c.positions,
      binding: l0.bindings[rt.comboOutputBase + n] ?? NONE,
      layers,
      timeoutMs: c.timeoutMs,
    });
  }
  return out;
}

export const comboSlotOf = (id: string) => (/^slot-(\d+)$/.test(id) ? Number(id.slice(5)) : -1);

/** レイヤーの一覧を「グループ × グループ内レイヤー」に変換。表せない組み合わせならエラー */
export function layersToMasks(layers: number[], per: number, count: number): { groups: number[]; layersInGroup: number[] } {
  if (!layers.length) return { groups: [], layersInGroup: [] };
  const gs = [...new Set(layers.map((l) => Math.floor(l / per)))].sort();
  const rs = [...new Set(layers.map((l) => l % per))].sort();
  const product = new Set(gs.flatMap((g) => rs.map((r) => g * per + r)));
  if (product.size !== new Set(layers).size || layers.some((l) => !product.has(l))) {
    throw new Error('コンボの有効なレイヤーは「OS の組み合わせ × レイヤー番号の組み合わせ」で指定してください');
  }
  const allGroups = Math.ceil(count / per);
  return { groups: gs.length === allGroups ? [] : gs, layersInGroup: rs.length === per ? [] : rs };
}

export function writeCombo(layers: Layer[], rt: RuntimeLayout, slot: number, combo: ComboDef | null): Layer[] {
  let cfg: Binding = { ...NONE };
  let out: Binding = { ...NONE };
  if (combo) {
    if (combo.positions.length < 2) throw new Error('コンボのキーを 2 個以上選んでください');
    if (combo.positions.length > 4) throw new Error('コンボのキーは 4 個までです');
    const m = layersToMasks(combo.layers, rt.layersPerGroup, layers.length);
    cfg = { b: rt.comboBehavior, p: encodeComboConfig({ positions: combo.positions, timeoutMs: combo.timeoutMs, ...m }) };
    out = { ...combo.binding, p: [...combo.binding.p] };
  }
  return layers.map((l, li) => {
    const bindings = [...l.bindings];
    bindings[rt.comboConfigBase + slot] = li === 0 ? cfg : { ...TRANS };
    bindings[rt.comboOutputBase + slot] = li === 0 ? out : { ...TRANS };
    return { ...l, bindings };
  });
}

// ---------------------------------------------------------------------------
// エンコーダー
// ---------------------------------------------------------------------------

export function readEncoder(layer: Layer, rt: RuntimeLayout, sensor: number): { cw: Binding; ccw: Binding } {
  return { cw: layer.bindings[encoderPosition(rt, sensor, 'cw')] ?? TRANS, ccw: layer.bindings[encoderPosition(rt, sensor, 'ccw')] ?? TRANS };
}

// ---------------------------------------------------------------------------
// 旧データ (物理キーだけのレイヤー) からの変換
// ---------------------------------------------------------------------------

/**
 * 物理キーだけのレイヤーに仮想キー位置を足す。
 *  エンコーダー: レイヤーの sensors (旧データ・キーマップファイル由来) があればそれ、無ければ透過
 *  マクロ・コンボ: レイヤー 0 は「なし」、他のレイヤーは透過
 */
export function padRuntimeLayers(layers: Layer[], kb: KeyboardDefinition): Layer[] {
  const rt = kb.runtime;
  if (!rt) return layers;
  return layers.map((l, li) => {
    if (l.bindings.length >= rt.total) return l;
    const bindings = l.bindings.slice(0, kb.keys.length);
    while (bindings.length < kb.keys.length) bindings.push({ ...TRANS });
    for (let s = 0; s < 2; s++) {
      const sb = l.sensors?.[s];
      bindings.push(sb ? { ...sb.cw, p: [...sb.cw.p] } : { ...TRANS }, sb ? { ...sb.ccw, p: [...sb.ccw.p] } : { ...TRANS });
    }
    while (bindings.length < rt.total) bindings.push(li === 0 ? { ...NONE } : { ...TRANS });
    const { sensors: _s, ...rest } = l;
    return { ...rest, bindings };
  });
}

/** 他のレイヤーで、レイヤー 0 だけで設定する位置が透過になっていないもの (設定が効かなくなる) */
export function globalPositionConflicts(layers: Layer[], rt: RuntimeLayout): { layer: number; pos: number }[] {
  const out: { layer: number; pos: number }[] = [];
  layers.forEach((l, li) => {
    if (li === 0) return;
    for (let pos = rt.macroBase; pos < rt.total; pos++) if (l.bindings[pos] && !bindingsEqual(l.bindings[pos], TRANS)) out.push({ layer: li, pos });
  });
  return out;
}

export const osGroupCount = (os: OsLayout | undefined) => os?.systems.length ?? 1;
