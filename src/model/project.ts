import type { Binding, KeyboardDefinition, Layer, Project } from './types';
import { layersFromParsed, parseKeymap } from '../zmk/keymap';

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** 既定のキーマップ (ZMK Studio 対応版の .keymap) */
export function defaultKeymapSource(kb: KeyboardDefinition): string {
  return kb.files.studio[kb.keymapPath] ?? kb.files.original[kb.keymapPath];
}

export function defaultLayers(kb: KeyboardDefinition, source = defaultKeymapSource(kb)): Layer[] {
  return layersFromParsed(parseKeymap(source));
}

export function createProject(kb: KeyboardDefinition, name: string, source = defaultKeymapSource(kb)): Project {
  const now = Date.now();
  return { id: newId(), name, keyboardId: kb.id, layers: defaultLayers(kb, source), keymapSource: source, macros: [], createdAt: now, updatedAt: now };
}

/** インポートした .keymap からプロジェクトを作成。キー数が合わない場合はエラー */
export function projectFromKeymapFile(kb: KeyboardDefinition, name: string, text: string): Project {
  const parsed = parseKeymap(text);
  const layers = layersFromParsed(parsed);
  if (!layers.length) throw new Error('キーマップにレイヤーがありません');
  const bad = layers.find((l) => l.bindings.length !== kb.keys.length);
  if (bad) throw new Error(`「${bad.name}」のキー数 (${bad.bindings.length}) が ${kb.name} のキー数 (${kb.keys.length}) と一致しません`);
  const p = createProject(kb, name, text);
  p.layers = layers;
  return p;
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
  version: 1;
  project: Project;
}

export function isProjectFile(v: unknown): v is ProjectFile {
  return !!v && typeof v === 'object' && (v as ProjectFile).format === 'choco-factory-project';
}
