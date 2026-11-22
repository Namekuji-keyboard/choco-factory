import type { Binding, KeyboardDefinition, Layer, Project } from './types';
import { behaviorRegistry, layersFromParsed, macroBehavior, parseKeymap } from '../zmk/keymap';
import { LAYERS_PER_OS, OS_LIST, defaultOsLayout, expandToOsLayers, inferOsDefaults, isOsProject } from './os';
import { macroBehaviorLabel, padRuntimeLayers, writeCombo, writeMacroSteps } from './runtime';

/** データ形式のバージョン (2 = OS 別キーマップ / 3 = 即時編集の仮想キー) */
export const PROJECT_SCHEMA = 3;

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** 既定のキーマップ (ZMK Studio 対応版の .keymap) */
export function defaultKeymapSource(kb: KeyboardDefinition): string {
  return kb.files.studio[kb.keymapPath] ?? kb.files.original[kb.keymapPath];
}

export function defaultLayers(kb: KeyboardDefinition, source = defaultKeymapSource(kb)): Layer[] {
  return layersFromParsed(parseKeymap(source));
}

const OS_LAYER_COUNT = LAYERS_PER_OS * OS_LIST.length;

/** キーマップのレイヤーを OS 別の 25 レイヤーにする (5 レイヤー以下なら各 OS にコピー) */
export function osLayersFromKeymap(kb: KeyboardDefinition, source: string, layers: Layer[]): Layer[] {
  if (layers.length === OS_LAYER_COUNT) return layers;
  if (layers.length > LAYERS_PER_OS) {
    throw new Error(
      `キーマップのレイヤー数が ${layers.length} です。OS 別キーマップ (5 OS × ${LAYERS_PER_OS} レイヤー) にするには、レイヤー数が ${LAYERS_PER_OS} 以下か ${OS_LAYER_COUNT} のキーマップを読み込んでください。`,
    );
  }
  const registry = behaviorRegistry(parseKeymap(source).customBehaviors);
  return expandToOsLayers(layers, registry, defaultOsLayout(), (id, name) => emptyLayer(kb, id, name));
}

export function createProject(kb: KeyboardDefinition, name: string, source = defaultKeymapSource(kb)): Project {
  const now = Date.now();
  const layers = padRuntimeLayers(osLayersFromKeymap(kb, source, defaultLayers(kb, source)), kb);
  const os = inferOsDefaults(layers, defaultOsLayout());
  return {
    id: newId(),
    name,
    keyboardId: kb.id,
    schema: PROJECT_SCHEMA,
    os,
    layers,
    keymapSource: kb.runtime && !isRuntimeSource(source, kb) ? defaultKeymapSource(kb) : source,
    macros: [],
    shortcuts: [],
    combos: kb.runtime ? [] : parseKeymap(source).combos,
    createdAt: now,
    updatedAt: now,
  };
}

/** インポートした .keymap からプロジェクトを作成。キー数が合わない場合はエラー */
export function projectFromKeymapFile(kb: KeyboardDefinition, name: string, text: string): Project {
  const parsed = parseKeymap(text);
  const layers = layersFromParsed(parsed);
  if (!layers.length) throw new Error('キーマップにレイヤーがありません');
  const bad = layers.find((l) => l.bindings.length !== kb.keys.length);
  if (bad) throw new Error(`「${bad.name}」のキー数 (${bad.bindings.length}) が ${kb.name} のキー数 (${kb.keys.length}) と一致しません`);
  return createProject(kb, name, text);
}

/** 即時編集の仮想キーを持つキーマップか */
export function isRuntimeSource(source: string, kb: KeyboardDefinition): boolean {
  if (!kb.runtime) return false;
  try {
    const p = parseKeymap(source);
    return p.layers.length > 0 && p.layers.every((l) => l.bindings.length === kb.runtime!.total) && p.labels.has(kb.runtime.comboBehavior);
  } catch {
    return false;
  }
}

/** 旧バージョン (OS 別キーマップ導入前) の既定キーマップか */
function isLegacyBundledSource(source: string): boolean {
  try {
    const p = parseKeymap(source);
    return p.layers.length === 5 && p.reservedLayers.length === 3 && source.includes('ZMK Studio から追加できる予備レイヤー');
  } catch {
    return false;
  }
}

/**
 * 保存データの移行 (既存ユーザーのデータを壊さないため)。
 *  - schema 1 (レイヤーの一覧のみ) → schema 2 (OS 別 5 × 5 レイヤー + ショートカット + コンボ)
 *  - 旧形式の 1〜5 レイヤーは各 OS に同じ内容でコピーします。6 レイヤー目以降は legacyLayers に保存します。
 */
export function migrateProject(p: Project, kb: KeyboardDefinition): Project {
  let next: Project = { ...p, macros: p.macros ?? [], shortcuts: p.shortcuts ?? [], combos: p.combos ?? [] };
  if (!next.os || !isOsProject(next)) {
    let source = next.keymapSource;
    if (isLegacyBundledSource(source)) source = defaultKeymapSource(kb);
    const base = next.layers.slice(0, LAYERS_PER_OS);
    const rest = next.layers.slice(LAYERS_PER_OS);
    const registry = behaviorRegistry([...parseKeymap(next.keymapSource).customBehaviors, ...next.macros.map(macroBehavior)]);
    let layers = next.layers.length === OS_LAYER_COUNT && next.os ? next.layers : expandToOsLayers(base, registry, defaultOsLayout(), (id, name) => emptyLayer(kb, id, name));
    // ファイル由来のエンコーダー設定 (旧データには無い) を補う
    const fileLayers = layersFromParsed(parseKeymap(source));
    layers = layers.map((l, i) => {
      if (l.sensors) return l;
      const s = (fileLayers[i] ?? fileLayers[i % LAYERS_PER_OS] ?? fileLayers[0])?.sensors;
      return s ? { ...l, sensors: s } : l;
    });
    next = {
      ...next,
      keymapSource: source,
      layers,
      os: inferOsDefaults(layers, defaultOsLayout()),
      ...(rest.length ? { legacyLayers: [...(p.legacyLayers ?? []), ...rest] } : {}),
    };
  }
  next = migrateToRuntime(next, kb);
  next.schema = PROJECT_SCHEMA;
  return next;
}

/**
 * schema 2 → 3: 物理キーだけのレイヤーに即時編集用の仮想キーを足し、
 * エンコーダー (sensors)・コンボ・マクロを仮想キーの設定に移す。
 */
function migrateToRuntime(p: Project, kb: KeyboardDefinition): Project {
  const rt = kb.runtime;
  if (!rt || (p.layers[0]?.bindings.length ?? 0) >= rt.total) return p;
  let layers = padRuntimeLayers(p.layers, kb);
  const names = { macros: Array.from({ length: rt.macroSlots }, () => ''), combos: Array.from({ length: rt.comboSlots }, () => '') };
  const keptCombos = [];
  let slot = 0;
  for (const c of p.combos ?? []) {
    try {
      if (slot >= rt.comboSlots) throw new Error('full');
      layers = writeCombo(layers, rt, slot, c);
      names.combos[slot++] = c.name;
    } catch {
      keptCombos.push(c);
    }
  }
  const keptMacros = [];
  let m = 0;
  for (const mac of p.macros ?? []) {
    if (m >= rt.macroSlots || mac.keys.length > rt.macroSteps) {
      keptMacros.push(mac);
      continue;
    }
    layers = writeMacroSteps(layers, rt, m, mac.keys.map((k) => ({ b: 'kp', p: [k] })));
    const label = macroBehaviorLabel(rt, m);
    layers = layers.map((l) => ({ ...l, bindings: l.bindings.map((b) => (b.b === mac.label ? { b: label, p: [] } : b)) }));
    names.macros[m++] = mac.name;
  }
  // 旧版の同梱キーマップ (25 レイヤー・物理キーのみ) は新しい同梱キーマップに切り替える
  const source = isRuntimeSource(p.keymapSource, kb) ? p.keymapSource : defaultKeymapSource(kb);
  return { ...p, layers, keymapSource: source, combos: keptCombos, macros: keptMacros, runtimeNames: names };
}

export const TRANS: Binding = { b: 'trans', p: [] };

export function emptyLayer(kb: KeyboardDefinition, id: number, name: string): Layer {
  return { id, name, bindings: kb.keys.map(() => ({ ...TRANS })) };
}

export function nextLayerId(layers: Layer[]): number {
  return layers.reduce((m, l) => Math.max(m, l.id), -1) + 1;
}

/** プロジェクト JSON ファイル */
export interface ProjectFile {
  format: 'choco-factory-project';
  /** 1 = 旧形式 / 2 = OS 別キーマップ (読み込み時に自動で移行) */
  version: 1 | 2;
  project: Project;
}

export function isProjectFile(v: unknown): v is ProjectFile {
  return !!v && typeof v === 'object' && (v as ProjectFile).format === 'choco-factory-project';
}
