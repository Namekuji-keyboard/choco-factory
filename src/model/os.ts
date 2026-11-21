/**
 * OS 別キーマップ (5 OS × 5 レイヤー = 25 レイヤー)。
 *
 * ZMK にはレイヤーの「グループ」の概念が無いため、OS 別の 25 レイヤーは ZMK の通常のレイヤー 0〜24 として並べます。
 *   OS i のレイヤー j  →  ZMK レイヤー i * 5 + j
 *     Windows: 0〜4 / macOS: 5〜9 / Linux: 10〜14 / iOS: 15〜19 / Android: 20〜24
 * レイヤー操作 (&mo / &lt / &to …) は常に同じ OS 内のレイヤーを指すように、ZMK のレイヤー番号 (絶対値) で保存します。
 */
import type { Binding, Layer, OsId, OsLayout, Project } from './types';
import type { BehaviorDef } from '../zmk/behaviors';

export interface OsInfo {
  id: OsId;
  name: string;
  short: string;
  /** OS 切替キーで選ぶ Bluetooth プロファイル (ZMK v0.2.1 のプロファイルは 0〜4 の 5 個) */
  profile: number;
}

export const OS_LIST: OsInfo[] = [
  { id: 'windows', name: 'Windows', short: 'Win', profile: 0 },
  { id: 'macos', name: 'macOS', short: 'Mac', profile: 1 },
  { id: 'linux', name: 'Linux', short: 'Linux', profile: 2 },
  { id: 'ios', name: 'iOS / iPadOS', short: 'iOS', profile: 3 },
  { id: 'android', name: 'Android', short: 'And', profile: 4 },
];

export const LAYERS_PER_OS = 5;
export const OS_SCHEMA = 2;

export function defaultOsLayout(): OsLayout {
  return { layersPerOs: LAYERS_PER_OS, systems: OS_LIST.map((o) => ({ id: o.id, defaultLayer: 0 })) };
}

export const osInfo = (id: OsId) => OS_LIST.find((o) => o.id === id)!;

/** ZMK レイヤー番号 → OS とその中のレイヤー番号 */
export function splitLayerIndex(os: OsLayout, index: number): { os: number; layer: number } {
  return { os: Math.floor(index / os.layersPerOs), layer: index % os.layersPerOs };
}

export const absLayer = (os: OsLayout, osIndex: number, layer: number) => osIndex * os.layersPerOs + layer;

/** OS のデフォルトレイヤーの ZMK レイヤー番号 */
export const osDefaultIndex = (os: OsLayout, osIndex: number) => absLayer(os, osIndex, os.systems[osIndex]?.defaultLayer ?? 0);

/** 表示用のレイヤー名 (現在の OS 内なら "L2"、別の OS なら "Mac L2") */
export function osLayerLabel(os: OsLayout, index: number, currentIndex?: number): string {
  const { os: o, layer } = splitLayerIndex(os, index);
  const info = OS_LIST[o];
  if (!info) return `L${index}?`;
  if (currentIndex !== undefined && splitLayerIndex(os, currentIndex).os === o) return `L${layer}`;
  return `${info.short} L${layer}`;
}

export const defaultLayerName = (osIndex: number, layer: number) => `${OS_LIST[osIndex]?.short ?? `OS${osIndex}`} ${layer}`;

/** バインディング内のレイヤー参照を変換 */
export function mapLayerRefs(b: Binding, def: BehaviorDef | undefined, fn: (layerId: number) => number): Binding {
  if (!def || b.raw !== undefined || def.params.length !== b.p.length || !def.params.includes('layer')) return b;
  return { ...b, p: b.p.map((v, i) => (def.params[i] === 'layer' ? fn(v) : v)) };
}

/**
 * レイヤー群を別の OS へコピーするときの変換。
 * コピー元 OS 内を指すレイヤー参照はコピー先 OS の同じレイヤーへ付け替え、OS 切替キーはそのまま残す。
 */
export function relocateBinding(b: Binding, def: BehaviorDef | undefined, os: OsLayout, fromOs: number, toOs: number): Binding {
  if (b.b === 'os_sel' || b.b === 'os_to') return b;
  return mapLayerRefs(b, def, (id) => {
    const s = splitLayerIndex(os, id);
    return s.os === fromOs ? absLayer(os, toOs, s.layer) : id;
  });
}

/**
 * OS のデフォルトレイヤー変更に合わせて OS 切替キーの移動先を更新。
 * 変更前のデフォルトレイヤーを指していたキー (= 標準の OS 切替キー) だけを付け替える。
 */
export function retargetOsKeys(layers: Layer[], before: OsLayout, after: OsLayout): Layer[] {
  const fix = (b: Binding): Binding => {
    const target = b.b === 'os_sel' && b.p.length === 2 ? b.p[1] : b.b === 'os_to' && b.p.length === 1 ? b.p[0] : undefined;
    if (target === undefined) return b;
    const o = splitLayerIndex(before, target).os;
    if (o < 0 || o >= before.systems.length || target !== osDefaultIndex(before, o)) return b;
    if (b.b === 'os_sel' && OS_LIST[o]?.profile !== b.p[0]) return b;
    const next = osDefaultIndex(after, o);
    if (next === target) return b;
    return b.b === 'os_sel' ? { ...b, p: [b.p[0], next] } : { ...b, p: [next] };
  };
  return layers.map((l) => {
    const bindings = l.bindings.map(fix);
    return bindings.some((x, i) => x !== l.bindings[i]) ? { ...l, bindings } : l;
  });
}

/** OS 切替キーのバインディング */
export function osSelectBinding(os: OsLayout, osIndex: number, linkBluetooth: boolean): Binding {
  return linkBluetooth ? { b: 'os_sel', p: [OS_LIST[osIndex].profile, osDefaultIndex(os, osIndex)] } : { b: 'os_to', p: [osDefaultIndex(os, osIndex)] };
}

/** デバイス / ファイルから読み込んだ OS 切替キーから各 OS のデフォルトレイヤーを推定 */
export function inferOsDefaults(layers: Layer[], os: OsLayout): OsLayout {
  const systems = os.systems.map((s) => ({ ...s }));
  for (const l of layers) {
    for (const b of l.bindings) {
      let target: number | undefined;
      if (b.b === 'os_sel' && b.p.length === 2) target = b.p[1];
      if (b.b === 'os_to' && b.p.length === 1) target = b.p[0];
      if (target === undefined) continue;
      const t = splitLayerIndex(os, target);
      if (b.b === 'os_sel' && OS_LIST[t.os]?.profile !== b.p[0]) continue;
      if (systems[t.os]) systems[t.os].defaultLayer = t.layer;
    }
  }
  return { ...os, systems };
}

/**
 * 1 OS 分のレイヤー (旧形式の 5 レイヤーなど) から OS 別の 25 レイヤーを作る。
 * 各 OS には同じ内容をコピーし、レイヤー参照はその OS 内を指すように付け替える。
 */
export function expandToOsLayers(base: Layer[], registry: Map<string, BehaviorDef>, os: OsLayout = defaultOsLayout(), blank?: (id: number, name: string) => Layer): Layer[] {
  const per = os.layersPerOs;
  const baseIdx = new Map(base.map((l, i) => [l.id, i]));
  const out: Layer[] = [];
  os.systems.forEach((_, o) => {
    for (let j = 0; j < per; j++) {
      const id = absLayer(os, o, j);
      const src = base[j];
      if (!src) {
        out.push(blank ? blank(id, defaultLayerName(o, j)) : { id, name: defaultLayerName(o, j), bindings: [] });
        continue;
      }
      out.push({
        id,
        name: defaultLayerName(o, j),
        bindings: src.bindings.map((b) =>
          mapLayerRefs(b, registry.get(b.b), (ref) => {
            const k = baseIdx.get(ref);
            return k !== undefined && k < per ? absLayer(os, o, k) : ref;
          }),
        ),
        sensors: src.sensors?.map((s) => ({ cw: { ...s.cw, p: [...s.cw.p] }, ccw: { ...s.ccw, p: [...s.ccw.p] } })),
      });
    }
  });
  return out;
}

/** OS 別の構成になっているか */
export const isOsProject = (p: Pick<Project, 'os' | 'layers'>): p is Pick<Project, 'layers'> & { os: OsLayout } =>
  !!p.os && p.layers.length === p.os.layersPerOs * p.os.systems.length;

/** OS のデフォルトレイヤーにある透過キーの数 (透過キーはレイヤー 0 = Windows L0 の割り当てになる) */
export function transparentOnDefault(layers: Layer[], os: OsLayout, osIndex: number): number {
  const idx = osDefaultIndex(os, osIndex);
  if (idx === 0) return 0;
  return layers[idx]?.bindings.filter((b) => b.b === 'trans').length ?? 0;
}
