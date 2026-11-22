import { create } from 'zustand';
import type { Binding, ComboDef, KeyboardDefinition, Layer, MacroDef, OsId, OsLayout, Project, RuntimeLayout, SensorBinding, ShortcutDef } from '../model/types';
import { createProject, emptyLayer, newId, nextLayerId, projectFromKeymapFile, defaultLayers, migrateProject, osLayersFromKeymap } from '../model/project';
import { absLayer, defaultOsLayout, inferOsDefaults, osInfo, relocateBinding, retargetOsKeys, splitLayerIndex } from '../model/os';
import { resolveShortcut, shortcutBehaviors } from '../model/shortcuts';
import { bindingsEqual } from '../zmk/keymap';
import { comboSlotOf, encoderPosition, isGlobalPosition, macroSlotOf, readCombos, writeCombo, writeMacroSteps } from '../model/runtime';
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

const DEFAULT_SETTINGS: Settings = { theme: 'dark', hostLayout: 'jis', confirmApply: true, showSimulator: false };

/** 履歴 (Undo / Redo) の対象になるプロジェクトの内容 */
type Snapshot = Pick<Project, 'layers' | 'macros' | 'shortcuts' | 'combos' | 'os' | 'runtimeNames'>;

export interface HistoryEntry extends Snapshot {
  label: string;
  time: number;
}

const snapshot = (p: Project): Snapshot => ({ layers: p.layers, macros: p.macros, shortcuts: p.shortcuts, combos: p.combos, os: p.os, runtimeNames: p.runtimeNames });

const runtimeNamesOf = (p: Project, rt: RuntimeLayout) => ({
  macros: Array.from({ length: rt.macroSlots }, (_, i) => p.runtimeNames?.macros[i] ?? ''),
  combos: Array.from({ length: rt.comboSlots }, (_, i) => p.runtimeNames?.combos[i] ?? ''),
});

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
  /** コピー元のレイヤー番号 (OS をまたいで貼り付けるときのレイヤー参照の付け替え用) */
  clipboardFrom: number;
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
  setLayers(layers: Layer[], label: string, os?: OsLayout): void;
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
  /** OS を選択 (同じ番号のレイヤーを表示) */
  setOs(osIndex: number): void;
  setOsDefault(osIndex: number, layer: number): void;
  /** Bluetooth プロファイル (レイヤーグループ) の OS を変更。キーの割り当ては変えない */
  setGroupOs(groupIndex: number, osId: OsId): void;
  /** OS の全レイヤーを別の OS にコピー */
  copyOs(from: number, to: number): void;
  /** レイヤーの内容を別のレイヤーにコピー (同じ OS 内 / 別の OS) */
  copyLayer(from: number, to: number): void;
  saveShortcut(s: ShortcutDef): void;
  removeShortcut(id: string): void;
  saveCombo(c: ComboDef): void;
  removeCombo(id: string): void;
  /** エンコーダーの割り当て (layerIndices のレイヤーに同じ設定) */
  setSensor(layerIndices: number[], sensorIndex: number, value: SensorBinding): void;
  /** 即時編集マクロ (スロット) の保存。steps が空なら削除 */
  saveRuntimeMacro(slot: number, name: string, steps: Binding[]): void;
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
    const entry: HistoryEntry = { label, time: Date.now(), ...snapshot(project) };
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

  const loadInto = (p0: Project) => {
    const kb = getKeyboard(p0.keyboardId);
    const p = migrateProject(p0, kb);
    const migrated = p0.schema !== p.schema;
    set({ project: p, keyboard: kb, layerIndex: p.os ? absLayer(p.os, 0, p.os.systems[0].defaultLayer) : 0, selected: [], past: [], future: [], saveStatus: 'saved', pickerTarget: null });
    void db.setMeta('lastProjectId', p.id);
    if (migrated) {
      void db.putProject(p);
      get().toast('info', `「${p.name}」を OS 別キーマップ (5 OS × 5 レイヤー) の形式に変換しました。元の内容は各 OS にコピーされています。`);
    }
  };

  /** 割り当て (キー・エンコーダー・コンボ) のすべてのバインディングを変換 */
  const mapAllBindings = (p: Project, fn: (b: Binding) => Binding): Partial<Project> => ({
    layers: p.layers.map((l) => {
      const bindings = l.bindings.map(fn);
      const sensors = l.sensors?.map((s) => ({ cw: fn(s.cw), ccw: fn(s.ccw) }));
      const changed = bindings.some((b, i) => b !== l.bindings[i]) || sensors?.some((s, i) => s.cw !== l.sensors![i].cw || s.ccw !== l.sensors![i].ccw);
      return changed ? { ...l, bindings, ...(sensors ? { sensors } : {}) } : l;
    }),
    combos: (p.combos ?? []).map((c) => {
      const b = fn(c.binding);
      return b === c.binding ? c : { ...c, binding: b };
    }),
  });

  return {
    ready: false,
    settings: DEFAULT_SETTINGS,
    projects: [],
    project: null,
    keyboard: KEYBOARDS[0],
    layerIndex: 0,
    selected: [],
    clipboard: null,
    clipboardFrom: 0,
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
      const p: Project = migrateProject({ ...proj, id: newId(), updatedAt: Date.now(), macros: proj.macros ?? [] }, getKeyboard(proj.keyboardId));
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
    setLayers(layers, label, os) {
      commit(label, () => (os ? { layers, os } : { layers }));
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
      const rt = get().keyboard.runtime;
      commit('レイヤーをクリア', (p) => ({
        // マクロ・コンボの設定 (レイヤー 0 だけで使う仮想キー) はそのまま
        layers: p.layers.map((l, i) => (i === index ? { ...l, bindings: l.bindings.map((b, pos) => (rt && isGlobalPosition(rt, pos) ? b : { b: 'trans', p: [] })) } : l)),
      }));
    },
    resetToDefault() {
      const { project, keyboard } = get();
      if (!project) return;
      const layers = osLayersFromKeymap(keyboard, project.keymapSource, defaultLayers(keyboard, project.keymapSource));
      const os = inferOsDefaults(layers, defaultOsLayout());
      commit('初期状態に戻す', () => ({ layers, macros: [], os, combos: parseKeymap(project.keymapSource).combos }));
      set({ layerIndex: 0, selected: [] });
    },
    copy() {
      const { project, layerIndex, selected } = get();
      if (!project || !selected.length) return;
      const sorted = [...selected].sort((a, b) => a - b);
      set({ clipboard: sorted.map((pos) => project.layers[layerIndex].bindings[pos]), clipboardFrom: layerIndex });
      get().toast('info', `${sorted.length} 個のキーをコピーしました`);
    },
    paste() {
      const { project, selected, layerIndex, clipboardFrom } = get();
      let clipboard = get().clipboard;
      if (!project || !clipboard?.length || !selected.length) return;
      // 別の OS に貼り付ける場合、コピー元の OS 内を指すレイヤー参照を貼り付け先の OS に付け替える
      if (project.os) {
        const os = project.os;
        const from = splitLayerIndex(os, clipboardFrom).os;
        const to = splitLayerIndex(os, layerIndex).os;
        if (from !== to) {
          const reg = registryFor(project);
          clipboard = clipboard.map((b) => relocateBinding(b, reg.get(b.b), os, from, to));
        }
      }
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
      const cur: HistoryEntry = { label: prev.label, time: Date.now(), ...snapshot(project) };
      const { label: _l, time: _t, ...snap } = prev;
      set({ project: { ...project, ...snap, updatedAt: Date.now() }, past: past.slice(0, -1), future: [cur, ...future] });
      set((s) => ({ layerIndex: Math.min(s.layerIndex, prev.layers.length - 1) }));
      scheduleSave();
    },
    redo() {
      const { project, past, future } = get();
      if (!project || !future.length) return;
      const next = future[0];
      const cur: HistoryEntry = { label: next.label, time: Date.now(), ...snapshot(project) };
      const { label: _l, time: _t, ...snap } = next;
      set({ project: { ...project, ...snap, updatedAt: Date.now() }, past: [...past, cur], future: future.slice(1) });
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
    setOs(osIndex) {
      const { project, layerIndex } = get();
      if (!project?.os) return;
      const rel = splitLayerIndex(project.os, layerIndex).layer;
      set({ layerIndex: absLayer(project.os, osIndex, rel), pickerTarget: null });
    },
    setOsDefault(osIndex, layer) {
      const { project } = get();
      if (!project?.os) return;
      const os: OsLayout = { ...project.os, systems: project.os.systems.map((s, i) => (i === osIndex ? { ...s, defaultLayer: layer } : s)) };
      commit(`${project.os.systems[osIndex].id} のデフォルトレイヤーを Layer ${layer} に変更`, (p) => ({ os, layers: retargetOsKeys(p.layers, project.os!, os) }));
    },
    setGroupOs(groupIndex, osId) {
      const { project } = get();
      if (!project?.os || project.os.systems[groupIndex]?.id === osId) return;
      const before = osInfo(project.os.systems[groupIndex].id);
      const after = osInfo(osId);
      const os: OsLayout = { ...project.os, systems: project.os.systems.map((s, i) => (i === groupIndex ? { ...s, id: osId } : s)) };
      // OS の選択はアプリ側の設定 (キーの一覧・プリセットの切り替え) なので、キーボードへの書き込みは発生しない。
      // レイヤー名も変えない (以前はここで名前を変えていたため、適用時にレイヤー名の書き込みと保存が発生していた)
      commit(`Bluetooth ${groupIndex + 1} の OS を ${after.name} に変更 (${before.name} から)`, () => ({ os }));
    },
    copyOs(from, to) {
      const { project } = get();
      const rt = get().keyboard.runtime;
      if (!project?.os || from === to) return;
      const os = project.os;
      const reg = registryFor(project);
      commit('OS のキーマップをコピー', (p) => ({
        layers: p.layers.map((l, i) => {
          const s = splitLayerIndex(os, i);
          if (s.os !== to) return l;
          const src = p.layers[absLayer(os, from, s.layer)];
          return {
            ...l,
            bindings: src.bindings.map((b, pos) => (rt && isGlobalPosition(rt, pos) ? l.bindings[pos] : relocateBinding(b, reg.get(b.b), os, from, to))),
            sensors: src.sensors?.map((x) => ({ cw: { ...x.cw }, ccw: { ...x.ccw } })),
          };
        }),
        os: { ...os, systems: os.systems.map((s, i) => (i === to ? { ...s, defaultLayer: os.systems[from].defaultLayer } : s)) },
      }));
    },
    copyLayer(from, to) {
      const { project } = get();
      const rt = get().keyboard.runtime;
      if (!project || from === to) return;
      const reg = registryFor(project);
      const os = project.os;
      const fromOs = os ? splitLayerIndex(os, from).os : 0;
      const toOs = os ? splitLayerIndex(os, to).os : 0;
      commit(`「${project.layers[from].name}」を「${project.layers[to].name}」にコピー`, (p) => ({
        layers: p.layers.map((l, i) =>
          i !== to
            ? l
            : {
                ...l,
                bindings: p.layers[from].bindings.map((b, pos) => (rt && isGlobalPosition(rt, pos) ? l.bindings[pos] : os ? relocateBinding(b, reg.get(b.b), os, fromOs, toOs) : b)),
                sensors: p.layers[from].sensors?.map((x) => ({ cw: { ...x.cw }, ccw: { ...x.ccw } })),
              },
        ),
      }));
    },
    saveShortcut(sc) {
      const { project } = get();
      if (!project) return;
      const list = project.shortcuts ?? [];
      const old = list.find((x) => x.id === sc.id);
      commit(old ? `ショートカット「${sc.name}」を編集` : `ショートカット「${sc.name}」を追加`, (p) => {
        const shortcuts = old ? list.map((x) => (x.id === sc.id ? sc : x)) : [...list, sc];
        const before = old ? resolveShortcut(old).binding : undefined;
        const after = resolveShortcut(sc).binding;
        // 割り当て済みのキーも新しい内容に更新
        if (old && before && after && !bindingsEqual(before, after)) {
          return { shortcuts, ...mapAllBindings(p, (b) => (bindingsEqual(b, before) ? { ...after, p: [...after.p] } : b)) };
        }
        return { shortcuts };
      });
    },
    removeShortcut(id) {
      const { project } = get();
      const sc = project?.shortcuts?.find((x) => x.id === id);
      if (!project || !sc) return;
      const r = resolveShortcut(sc);
      commit(`ショートカット「${sc.name}」を削除`, (p) => ({
        shortcuts: (p.shortcuts ?? []).filter((x) => x.id !== id),
        // マクロとして出力するショートカットは定義が無くなるので「なし」にする
        ...(r.kind === 'macro' && r.binding ? mapAllBindings(p, (b) => (b.b === r.binding!.b ? { b: 'none', p: [] } : b)) : {}),
      }));
    },
    saveCombo(c) {
      const { project, keyboard } = get();
      if (!project) return;
      const rt = keyboard.runtime;
      if (!rt) {
        const list = project.combos ?? [];
        const exists = list.some((x) => x.id === c.id);
        commit(exists ? `コンボ「${c.name}」を編集` : `コンボ「${c.name}」を追加`, () => ({ combos: exists ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c] }));
        return;
      }
      // 即時編集: コンボはレイヤー 0 の仮想キー (設定 + 動作) に書き込む
      const used = new Set(readCombos(project, rt).map((x) => comboSlotOf(x.id)));
      let slot = comboSlotOf(c.id);
      const exists = slot >= 0 && used.has(slot);
      if (slot < 0) slot = Array.from({ length: rt.comboSlots }, (_, i) => i).find((i) => !used.has(i)) ?? -1;
      if (slot < 0) {
        get().toast('error', `コンボは ${rt.comboSlots} 個までです`);
        return;
      }
      let layers: Layer[];
      try {
        layers = writeCombo(project.layers, rt, slot, c);
      } catch (e) {
        get().toast('error', (e as Error).message);
        return;
      }
      const names = runtimeNamesOf(project, rt);
      names.combos[slot] = c.name;
      commit(exists ? `コンボ「${c.name}」を編集` : `コンボ「${c.name}」を追加`, () => ({ layers, runtimeNames: names }));
    },
    removeCombo(id) {
      const { project, keyboard } = get();
      if (!project) return;
      const rt = keyboard.runtime;
      if (!rt) {
        const c = project.combos?.find((x) => x.id === id);
        if (!c) return;
        commit(`コンボ「${c.name}」を削除`, (p) => ({ combos: (p.combos ?? []).filter((x) => x.id !== id) }));
        return;
      }
      const slot = comboSlotOf(id);
      if (slot < 0) return;
      const names = runtimeNamesOf(project, rt);
      const name = names.combos[slot] || `combo_${slot + 1}`;
      names.combos[slot] = '';
      commit(`コンボ「${name}」を削除`, (p) => ({ layers: writeCombo(p.layers, rt, slot, null), runtimeNames: names }));
    },
    saveRuntimeMacro(slot, name, steps) {
      const { project, keyboard } = get();
      const rt = keyboard.runtime;
      if (!project || !rt) return;
      let layers: Layer[];
      try {
        layers = writeMacroSteps(project.layers, rt, slot, steps);
      } catch (e) {
        get().toast('error', (e as Error).message);
        return;
      }
      const names = runtimeNamesOf(project, rt);
      names.macros[slot] = name;
      commit(steps.length ? `マクロ「${name}」を保存` : `マクロ「${name}」を削除`, () => ({ layers, runtimeNames: names }));
    },
    setSensor(layerIndices, sensorIndex, value) {
      const { project, keyboard } = get();
      if (!project) return;
      const rt = keyboard.runtime;
      const label = layerIndices.length > 1 ? `エンコーダーの設定を ${layerIndices.length} レイヤーに適用` : 'エンコーダーの設定を変更';
      if (rt) {
        // 即時編集: エンコーダーの仮想キーに書き込む (ZMK Studio で反映できる)
        commit(label, (p) => ({
          layers: p.layers.map((l, i) => {
            if (!layerIndices.includes(i)) return l;
            const bindings = [...l.bindings];
            bindings[encoderPosition(rt, sensorIndex, 'cw')] = { ...value.cw, p: [...value.cw.p] };
            bindings[encoderPosition(rt, sensorIndex, 'ccw')] = { ...value.ccw, p: [...value.ccw.p] };
            return { ...l, bindings };
          }),
        }));
        return;
      }
      const count = Math.max(sensorIndex + 1, ...(keyboard.encoders ?? []).map((e) => e.sensorIndex + 1));
      commit(label, (p) => ({
        layers: p.layers.map((l, i) => {
          if (!layerIndices.includes(i)) return l;
          const sensors: SensorBinding[] = Array.from({ length: count }, (_, k) => l.sensors?.[k] ?? { cw: { b: 'trans', p: [] }, ccw: { b: 'trans', p: [] } });
          sensors[sensorIndex] = { cw: { ...value.cw, p: [...value.cw.p] }, ccw: { ...value.ccw, p: [...value.ccw.p] } };
          return { ...l, sensors };
        }),
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
  const reg = behaviorRegistry([...customBehaviorsFor(project.keymapSource), ...project.macros.map(macroBehavior), ...shortcutBehaviors(project.shortcuts), ...extra]);
  const rt = getKeyboard(project.keyboardId).runtime;
  if (rt) {
    // 即時編集マクロ (&rtm0〜) はプロジェクトで付けた名前で表示
    for (const [label, def] of reg) {
      const slot = macroSlotOf(rt, label);
      if (slot >= 0) reg.set(label, { ...def, nameJa: project.runtimeNames?.macros[slot] || `マクロ ${slot + 1}`, description: '即時編集マクロ (中身は「マクロ」タブで編集し、キーボードに直接書き込めます)' });
      if (label === rt.comboBehavior) reg.set(label, { ...def, nameJa: 'コンボ設定 (内部用)', description: 'コンボの設定を保持する内部用のビヘイビア' });
      if (label === 'vkey') reg.set(label, { ...def, nameJa: '仮想キー (内部用)', description: '仮想キー位置の割り当てを押す内部用のビヘイビア' });
    }
  }
  return reg;
}

export function scrollValFor(source: string): number {
  try {
    return parseKeymap(source).scrollVal;
  } catch {
    return 10;
  }
}
