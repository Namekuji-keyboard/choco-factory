import { create } from 'zustand';
import type { Binding, KeyboardDefinition, Layer, MacroDef, Project } from '../model/types';
import { createProject, emptyLayer, newId, nextLayerId, projectFromKeymapFile, defaultLayers } from '../model/project';
import * as db from '../storage/db';
import { KEYBOARDS, getKeyboard } from '../keyboards';
import { behaviorRegistry, macroBehavior, parseKeymap } from '../zmk/keymap';
import type { BehaviorDef } from '../zmk/behaviors';
import type { HostLayout } from '../zmk/keycodes';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  hostLayout: HostLayout;
  confirmApply: boolean;
  showSimulator: boolean;
}

const DEFAULT_SETTINGS: Settings = { theme: 'system', hostLayout: 'jis', confirmApply: true, showSimulator: false };

export interface HistoryEntry {
  label: string;
  time: number;
  layers: Layer[];
  macros: MacroDef[];
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  keyboardId: string;
}

interface EditorState {
  ready: boolean;
  settings: Settings;
  projects: ProjectSummary[];
  project: Project | null;
  keyboard: KeyboardDefinition;
  layerIndex: number;
  selected: number[];
  clipboard: Binding[] | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  saveStatus: SaveStatus;
  /** キーコード一覧のクリック先 (null = キー入力として割り当て、数値 = 選択中ビヘイビアのパラメータ番号) */
  pickerTarget: number | null;
  toasts: Toast[];
  persistent: boolean;

  init(): Promise<void>;
  updateSettings(s: Partial<Settings>): void;
  toast(kind: Toast['kind'], text: string): void;
  dismissToast(id: number): void;

  openProject(id: string): Promise<void>;
  newProject(name: string, keyboardId?: string): Promise<void>;
  importKeymap(name: string, text: string): Promise<void>;
  importProject(p: Project): Promise<void>;
  renameProject(id: string, name: string): Promise<void>;
  duplicateProject(id: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  refreshProjects(): Promise<void>;

  setLayerIndex(i: number): void;
  select(pos: number, mode?: 'single' | 'toggle' | 'range'): void;
  selectAll(): void;
  clearSelection(): void;
  setPickerTarget(t: number | null): void;

  /** 選択中 (または指定) のキーに割り当てる */
  assign(binding: Binding | ((old: Binding) => Binding), label: string, positions?: number[]): void;
  setLayers(layers: Layer[], label: string): void;
  renameLayer(index: number, name: string): void;
  addLayer(copyFrom?: number): void;
  removeLayer(index: number): void;
  clearLayer(index: number): void;
  resetToDefault(): void;
  copy(): void;
  paste(): void;
  undo(): void;
  redo(): void;
  jumpTo(pastIndex: number): void;
  saveMacro(m: MacroDef, oldLabel?: string): void;
  removeMacro(label: string): void;
  replaceDevice(device: Project['device']): void;
}

const HISTORY_LIMIT = 200;
let toastId = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function summary(p: Project): ProjectSummary {
  return { id: p.id, name: p.name, updatedAt: p.updatedAt, keyboardId: p.keyboardId };
}

export const useEditor = create<EditorState>((set, get) => {
  /** プロジェクトを変更して履歴に積み、自動保存を予約 */
  const commit = (label: string, change: (p: Project) => Partial<Project>) => {
    const { project, past } = get();
    if (!project) return;
    const entry: HistoryEntry = { label, time: Date.now(), layers: project.layers, macros: project.macros };
    const next = { ...project, ...change(project), updatedAt: Date.now() };
    set({ project: next, past: [...past, entry].slice(-HISTORY_LIMIT), future: [] });
    scheduleSave();
  };

  const scheduleSave = () => {
    set({ saveStatus: 'unsaved' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const p = get().project;
      if (!p) return;
      set({ saveStatus: 'saving' });
      try {
        await db.putProject(p);
        set((s) => ({ saveStatus: s.project === p ? 'saved' : s.saveStatus, projects: upsert(s.projects, summary(p)) }));
      } catch (e) {
        set({ saveStatus: 'error' });
        get().toast('error', `ブラウザへの保存に失敗しました: ${(e as Error).message}`);
      }
    }, 400);
  };

  const flush = async () => {
    clearTimeout(saveTimer);
    const p = get().project;
    if (p && get().saveStatus !== 'saved') {
      await db.putProject(p);
      set({ saveStatus: 'saved' });
    }
  };

  const loadInto = (p: Project) => {
    set({ project: p, keyboard: getKeyboard(p.keyboardId), layerIndex: 0, selected: [], past: [], future: [], saveStatus: 'saved', pickerTarget: null });
    void db.setMeta('lastProjectId', p.id);
  };

  return {
    ready: false,
    settings: DEFAULT_SETTINGS,
    projects: [],
    project: null,
    keyboard: KEYBOARDS[0],
    layerIndex: 0,
    selected: [],
    clipboard: null,
    past: [],
    future: [],
    saveStatus: 'saved',
    pickerTarget: null,
    toasts: [],
    persistent: false,

    async init() {
      const settings = { ...DEFAULT_SETTINGS, ...((await db.getMeta<Partial<Settings>>('settings')) ?? {}) };
      let projects = await db.listProjects();
      if (!projects.length) {
        const p = createProject(KEYBOARDS[0], 'マイキーマップ');
        await db.putProject(p);
        projects = [p];
      }
      const lastId = await db.getMeta<string>('lastProjectId');
      const p = projects.find((x) => x.id === lastId) ?? projects[0];
      set({ settings, projects: projects.map(summary), ready: true });
      loadInto(p);
      const persistent = await db.requestPersistence();
      set({ persistent });
      window.addEventListener('beforeunload', () => void flush());
    },

    updateSettings(s) {
      const settings = { ...get().settings, ...s };
      set({ settings });
      void db.setMeta('settings', settings);
    },

    toast(kind, text) {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 3500);
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    async openProject(id) {
      await flush();
      const p = await db.getProject(id);
      if (p) loadInto(p);
    },
    async newProject(name, keyboardId) {
      await flush();
      const p = createProject(getKeyboard(keyboardId ?? get().keyboard.id), name);
      await db.putProject(p);
      set((s) => ({ projects: upsert(s.projects, summary(p)) }));
      loadInto(p);
    },
    async importKeymap(name, text) {
      await flush();
      const p = projectFromKeymapFile(get().keyboard, name, text);
      await db.putProject(p);
      set((s) => ({ projects: upsert(s.projects, summary(p)) }));
      loadInto(p);
    },
    async importProject(proj) {
      await flush();
      const p: Project = { ...proj, id: newId(), updatedAt: Date.now(), macros: proj.macros ?? [] };
      parseKeymap(p.keymapSource); // 妥当性確認
      await db.putProject(p);
      set((s) => ({ projects: upsert(s.projects, summary(p)) }));
      loadInto(p);
    },
    async renameProject(id, name) {
      const cur = get().project;
      if (cur?.id === id) {
        const next = { ...cur, name, updatedAt: Date.now() };
        set({ project: next });
        await db.putProject(next);
        set((s) => ({ projects: upsert(s.projects, summary(next)) }));
        return;
      }
      const p = await db.getProject(id);
      if (!p) return;
      const next = { ...p, name, updatedAt: Date.now() };
      await db.putProject(next);
      set((s) => ({ projects: upsert(s.projects, summary(next)) }));
    },
    async duplicateProject(id) {
      await flush();
      const p = await db.getProject(id);
      if (!p) return;
      const now = Date.now();
      const copy: Project = { ...structuredClone(p), id: newId(), name: `${p.name} のコピー`, createdAt: now, updatedAt: now, device: undefined };
      await db.putProject(copy);
      set((s) => ({ projects: upsert(s.projects, summary(copy)) }));
    },
    async deleteProject(id) {
      await db.deleteProject(id);
      const rest = get().projects.filter((p) => p.id !== id);
      set({ projects: rest });
      if (get().project?.id === id) {
        if (rest.length) await get().openProject(rest[0].id);
        else await get().newProject('マイキーマップ');
      }
    },
    async refreshProjects() {
      set({ projects: (await db.listProjects()).map(summary) });
    },

    setLayerIndex(i) {
      set({ layerIndex: i });
    },
    select(pos, mode = 'single') {
      const { selected } = get();
      if (mode === 'toggle') {
        set({ selected: selected.includes(pos) ? selected.filter((p) => p !== pos) : [...selected, pos], pickerTarget: null });
      } else if (mode === 'range' && selected.length) {
        const a = selected[selected.length - 1];
        const [lo, hi] = a < pos ? [a, pos] : [pos, a];
        const range = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
        set({ selected: [...new Set([...selected, ...range])], pickerTarget: null });
      } else {
        set({ selected: [pos], pickerTarget: null });
      }
    },
    selectAll() {
      set({ selected: get().keyboard.keys.map((_, i) => i) });
    },
    clearSelection() {
      set({ selected: [], pickerTarget: null });
    },
    setPickerTarget(t) {
      set({ pickerTarget: t });
    },

    assign(binding, label, positions) {
      const { project, layerIndex, selected } = get();
      if (!project) return;
      const targets = positions ?? selected;
      if (!targets.length) return;
      commit(label, (p) => ({
        layers: p.layers.map((l, i) =>
          i !== layerIndex
            ? l
            : { ...l, bindings: l.bindings.map((b, pos) => (targets.includes(pos) ? (typeof binding === 'function' ? binding(b) : binding) : b)) },
        ),
      }));
    },
    setLayers(layers, label) {
      commit(label, () => ({ layers }));
      set((s) => ({ layerIndex: Math.min(s.layerIndex, layers.length - 1) }));
    },
    renameLayer(index, name) {
      commit(`レイヤー名を「${name}」に変更`, (p) => ({ layers: p.layers.map((l, i) => (i === index ? { ...l, name } : l)) }));
    },
    addLayer(copyFrom) {
      const { project, keyboard } = get();
      if (!project) return;
      const id = nextLayerId(project.layers);
      const name = `Layer ${project.layers.length}`;
      const layer =
        copyFrom !== undefined
          ? { id, name: `${project.layers[copyFrom].name} のコピー`, bindings: project.layers[copyFrom].bindings.map((b) => ({ ...b, p: [...b.p] })) }
          : emptyLayer(keyboard, id, name);
      commit(copyFrom !== undefined ? `レイヤー「${project.layers[copyFrom].name}」を複製` : 'レイヤーを追加', (p) => ({ layers: [...p.layers, layer] }));
      set({ layerIndex: project.layers.length });
    },
    removeLayer(index) {
      const { project } = get();
      if (!project || project.layers.length <= 1) return;
      commit(`レイヤー「${project.layers[index].name}」を削除`, (p) => ({ layers: p.layers.filter((_, i) => i !== index) }));
      set((s) => ({ layerIndex: Math.max(0, Math.min(s.layerIndex, s.project!.layers.length - 1)) }));
    },
    clearLayer(index) {
      commit('レイヤーをクリア', (p) => ({
        layers: p.layers.map((l, i) => (i === index ? { ...l, bindings: l.bindings.map(() => ({ b: 'trans', p: [] })) } : l)),
      }));
    },
    resetToDefault() {
      const { project, keyboard } = get();
      if (!project) return;
      commit('初期状態に戻す', () => ({ layers: defaultLayers(keyboard, project.keymapSource), macros: [] }));
      set({ layerIndex: 0, selected: [] });
    },
    copy() {
      const { project, layerIndex, selected } = get();
      if (!project || !selected.length) return;
      const sorted = [...selected].sort((a, b) => a - b);
      set({ clipboard: sorted.map((pos) => project.layers[layerIndex].bindings[pos]) });
      get().toast('info', `${sorted.length} 個のキーをコピーしました`);
    },
    paste() {
      const { project, clipboard, selected, layerIndex } = get();
      if (!project || !clipboard?.length || !selected.length) return;
      const sorted = [...selected].sort((a, b) => a - b);
      // 1 個コピー → 選択中の全キーに貼り付け / 複数コピー → 先頭の選択位置から順に貼り付け
      const start = sorted[0];
      const n = project.layers[layerIndex].bindings.length;
      const map = new Map<number, Binding>();
      if (clipboard.length === 1) sorted.forEach((pos) => map.set(pos, clipboard[0]));
      else clipboard.forEach((b, i) => start + i < n && map.set(start + i, b));
      commit(`${map.size} 個のキーに貼り付け`, (p) => ({
        layers: p.layers.map((l, i) => (i !== layerIndex ? l : { ...l, bindings: l.bindings.map((b, pos) => map.get(pos) ?? b) })),
      }));
    },
    undo() {
      const { project, past, future } = get();
      if (!project || !past.length) return;
      const prev = past[past.length - 1];
      const cur: HistoryEntry = { label: prev.label, time: Date.now(), layers: project.layers, macros: project.macros };
      set({ project: { ...project, layers: prev.layers, macros: prev.macros, updatedAt: Date.now() }, past: past.slice(0, -1), future: [cur, ...future] });
      set((s) => ({ layerIndex: Math.min(s.layerIndex, prev.layers.length - 1) }));
      scheduleSave();
    },
    redo() {
      const { project, past, future } = get();
      if (!project || !future.length) return;
      const next = future[0];
      const cur: HistoryEntry = { label: next.label, time: Date.now(), layers: project.layers, macros: project.macros };
      set({ project: { ...project, layers: next.layers, macros: next.macros, updatedAt: Date.now() }, past: [...past, cur], future: future.slice(1) });
      set((s) => ({ layerIndex: Math.min(s.layerIndex, next.layers.length - 1) }));
      scheduleSave();
    },
    jumpTo(pastIndex) {
      // past[pastIndex] の操作を行う直前の状態に戻す
      const steps = get().past.length - pastIndex;
      for (let i = 0; i < steps; i++) get().undo();
    },
    saveMacro(m, oldLabel) {
      commit(oldLabel ? `マクロ「${m.name}」を編集` : `マクロ「${m.name}」を作成`, (p) => {
        const macros = oldLabel ? p.macros.map((x) => (x.label === oldLabel ? m : x)) : [...p.macros, m];
        // ラベルが変わった場合は割り当て済みのキーも追従
        const layers =
          oldLabel && oldLabel !== m.label
            ? p.layers.map((l) => ({ ...l, bindings: l.bindings.map((b) => (b.b === oldLabel ? { ...b, b: m.label } : b)) }))
            : p.layers;
        return { macros, layers };
      });
    },
    removeMacro(label) {
      commit('マクロを削除', (p) => ({
        macros: p.macros.filter((m) => m.label !== label),
        layers: p.layers.map((l) => ({ ...l, bindings: l.bindings.map((b) => (b.b === label ? { b: 'none', p: [] } : b)) })),
      }));
    },
    replaceDevice(device) {
      const p = get().project;
      if (!p) return;
      const next = { ...p, device };
      set({ project: next });
      void db.putProject(next);
    },
  };
});

function upsert(list: ProjectSummary[], s: ProjectSummary): ProjectSummary[] {
  const rest = list.filter((x) => x.id !== s.id);
  return [s, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---- ビヘイビア一覧 (キーマップ・マクロ・接続中デバイスから) ----

const customCache = new Map<string, BehaviorDef[]>();
export function customBehaviorsFor(source: string): BehaviorDef[] {
  let v = customCache.get(source);
  if (!v) {
    try {
      v = parseKeymap(source).customBehaviors;
    } catch {
      v = [];
    }
    customCache.set(source, v);
  }
  return v;
}

export function registryFor(project: Project | null, extra: BehaviorDef[] = []): Map<string, BehaviorDef> {
  if (!project) return behaviorRegistry(extra);
  return behaviorRegistry([...customBehaviorsFor(project.keymapSource), ...project.macros.map(macroBehavior), ...extra]);
}

export function scrollValFor(source: string): number {
  try {
    return parseKeymap(source).scrollVal;
  } catch {
    return 10;
  }
}
