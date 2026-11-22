import { useMemo } from 'react';
import { create } from 'zustand';
import type { Layer } from '../model/types';
import { DeviceError, LockState, LockedError, StudioDevice, type DeviceInfo, type TransportKind } from '../device/studio';
import { StudioSimulator } from '../device/simulator';
import { applyToDevice, buildBehaviorMap, layersFromDevice, planApply, planSize, unknownLabel, type ApplyProgress, type BehaviorMap } from '../device/sync';
import { findKeyboardByDeviceName } from '../keyboards';
import { BUILTIN_BEHAVIORS, type BehaviorDef } from '../zmk/behaviors';
import { customBehaviorsFor, registryFor, scrollValFor, useEditor } from './editor';
import { deviceWrappers, wrapperBehaviors } from '../device/wrappers';
import { macroBehavior } from '../zmk/keymap';
import { shortcutBehaviors } from '../model/shortcuts';
import { inferOsDefaults } from '../model/os';

/**
 * 接続状態
 *  disconnected 未接続 / selecting 接続待機 (デバイス選択中) / connecting 接続中 / locked ロック解除待ち /
 *  loading キーマップ取得中 / connected 接続完了 (差分なし) / editing 編集中 (未適用の変更あり) /
 *  writing 書き込み中 / saved 保存完了 / error エラー
 */
export type DeviceStatus = 'disconnected' | 'selecting' | 'connecting' | 'locked' | 'loading' | 'connected' | 'writing' | 'saved' | 'error';

export const STATUS_LABELS: Record<DeviceStatus | 'editing', string> = {
  disconnected: '未接続',
  selecting: '接続待機',
  connecting: '接続中',
  locked: 'ロック解除待ち',
  loading: 'キーマップ取得中',
  connected: '接続完了',
  editing: '編集中',
  writing: '書き込み中',
  saved: '保存完了',
  error: 'エラー',
};

interface DeviceState {
  status: DeviceStatus;
  kind: TransportKind | 'sim' | null;
  dev: StudioDevice | null;
  sim: StudioSimulator | null;
  info: DeviceInfo | null;
  map: BehaviorMap | null;
  /** 最後に取得 / 書き込みしたデバイスのキーマップ */
  deviceLayers: Layer[] | null;
  availableLayers: number;
  error: string | null;
  progress: ApplyProgress | null;
  /** 接続直後: デバイスとプロジェクトの内容が異なる */
  pendingLoad: Layer[] | null;
  /** キーボードのレイヤー数がプロジェクト (OS 別 25 レイヤー) と合わない場合の説明 */
  layerMismatch: string | null;

  connect(kind: TransportKind | 'sim'): Promise<void>;
  disconnect(): Promise<void>;
  load(): Promise<void>;
  /** デバイスのキーマップをプロジェクトに読み込む */
  acceptDeviceKeymap(): void;
  dismissPendingLoad(): void;
  apply(): Promise<boolean>;
  discard(): Promise<void>;
  resetDevice(): Promise<void>;
  registry(): Map<string, BehaviorDef>;
}

/** 接続中デバイスにだけ存在するビヘイビア (アプリ側で名前を特定できなかったもの) */
function deviceOnlyBehaviors(map: BehaviorMap | null): BehaviorDef[] {
  if (!map) return [];
  return map.behaviors
    .filter((b) => !b.label)
    .map((b) => ({
      label: unknownLabel(b),
      displayName: b.displayName,
      nameJa: b.displayName,
      description: 'キーボードのファームウェアに含まれるビヘイビア',
      params: Array.from({ length: b.paramCount }, () => 'number' as const),
      group: 'custom' as const,
      custom: true,
    }));
}

const simStorage = {
  load: () => {
    try {
      return localStorage.getItem('choco-sim-flash');
    } catch {
      return null;
    }
  },
  save: (v: string) => {
    try {
      localStorage.setItem('choco-sim-flash', v);
    } catch {
      /* noop */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem('choco-sim-flash');
    } catch {
      /* noop */
    }
  },
};

export const useDevice = create<DeviceState>((set, get) => {
  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    set({ status: 'error', error: msg, progress: null });
    useEditor.getState().toast('error', msg);
  };

  const events = {
    onLockStateChanged: (s: LockState) => {
      if (s === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED && get().status === 'locked') {
        useEditor.getState().toast('success', 'キーボードのロックが解除されました');
        void get().load();
      } else if (s === LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED && get().dev) {
        set({ status: 'locked' });
      }
    },
    onDisconnect: () => {
      if (get().dev) {
        set({ dev: null, status: 'disconnected', info: null, map: null, deviceLayers: null, pendingLoad: null, progress: null });
        useEditor.getState().toast('info', 'キーボードとの接続が切れました。再接続できない場合は USB ケーブルを抜き差ししてから「キーボードに接続」を押してください。');
      }
    },
  };

  return {
    status: 'disconnected',
    kind: null,
    dev: null,
    sim: null,
    info: null,
    map: null,
    deviceLayers: null,
    availableLayers: 0,
    error: null,
    progress: null,
    pendingLoad: null,
    layerMismatch: null,

    registry() {
      const ed = useEditor.getState();
      return registryFor(ed.project, deviceOnlyBehaviors(get().map));
    },

    async connect(kind) {
      if (get().dev) await get().disconnect();
      set({ status: 'selecting', error: null, kind });
      let dev: StudioDevice;
      try {
        if (kind === 'sim') {
          const sim = new StudioSimulator(useEditor.getState().keyboard, { locked: true, storage: simStorage });
          set({ sim });
          dev = StudioDevice.fromTransport(sim.transport(), 'usb', events);
        } else {
          dev = await StudioDevice.connect(kind, events);
        }
      } catch (e) {
        const name = (e as Error)?.name;
        // ユーザーがデバイス選択をキャンセルした
        if (name === 'NotFoundError' || name === 'UserCancelledError' || /cancel|No port selected/i.test(String((e as Error)?.message))) {
          set({ status: 'disconnected' });
          return;
        }
        fail(e);
        return;
      }
      set({ dev, status: 'connecting' });
      try {
        const info = await dev.getDeviceInfo();
        set({ info });
        const ed = useEditor.getState();
        const kb = findKeyboardByDeviceName(info.name);
        if (!kb) ed.toast('info', `「${info.name}」は登録されていないキーボードです。キー配置はキーボードから取得した情報で表示します。`);
        const lock = await dev.getLockState();
        if (lock !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) {
          set({ status: 'locked' });
          return;
        }
        await get().load();
      } catch (e) {
        fail(e);
      }
    },

    async disconnect() {
      const dev = get().dev;
      set({ dev: null, status: 'disconnected', info: null, map: null, deviceLayers: null, pendingLoad: null, progress: null, sim: null, layerMismatch: null });
      await dev?.disconnect();
    },

    async load() {
      const dev = get().dev;
      if (!dev) return;
      set({ status: 'loading', error: null });
      try {
        const ed = useEditor.getState();
        const known = [
          ...BUILTIN_BEHAVIORS,
          ...(ed.project ? customBehaviorsFor(ed.project.keymapSource) : []),
          ...(ed.project?.macros.map(macroBehavior) ?? []),
          ...shortcutBehaviors(ed.project?.shortcuts),
          // 代わりのマクロ (プロジェクトのキーマップが古くて定義を含まない場合も対応付けられるように)
          ...(ed.keyboard.runtime ? wrapperBehaviors(ed.project ? scrollValFor(ed.project.keymapSource) : 10) : []),
        ];
        const map = buildBehaviorMap(await dev.listBehaviors(), known, deviceWrappers(ed.project ? scrollValFor(ed.project.keymapSource) : 10));
        set({ map });
        const keymap = await dev.getKeymap();
        const layers = layersFromDevice(keymap, map, get().registry());
        set({ deviceLayers: layers, availableLayers: keymap.availableLayers, status: 'connected', layerMismatch: null });
        const project = useEditor.getState().project;
        const keyCount = project?.layers[0]?.bindings.length ?? 0;
        if (project?.os && (layers.length !== project.layers.length || (layers[0] && layers[0].bindings.length !== keyCount))) {
          const msg =
            layers.length !== project.layers.length
              ? `キーボードのレイヤー数は ${layers.length} です。OS 別キーマップ (${project.layers.length} レイヤー) を書き込むには、新しいファームウェアを書き込んでください (「ファイル」→「ZMK 設定一式 (ZIP)」でビルドできます)。`
              : `キーボードのキー位置の数は ${layers[0].bindings.length} です (このアプリは ${keyCount})。エンコーダー・マクロ・コンボを即時編集できる新しいファームウェアを書き込んでください (「ファイル」→「ZMK 設定一式 (ZIP)」でビルドできます)。`;
          set({ layerMismatch: msg });
          useEditor.getState().toast('error', msg);
          return;
        }
        if (project && planSize(planApply(project.layers, layers)) > 0) set({ pendingLoad: layers });
        else useEditor.getState().toast('success', 'キーボードに接続しました。キーマップはこのプロジェクトと同じです。');
      } catch (e) {
        if (e instanceof LockedError) {
          set({ status: 'locked' });
          return;
        }
        fail(e);
      }
    },

    acceptDeviceKeymap() {
      const layers = get().pendingLoad;
      if (!layers) return;
      const ed = useEditor.getState();
      const cur = ed.project;
      // エンコーダーの設定は ZMK Studio では取得できないので、プロジェクトの設定を残す
      const merged = layers.map((l, i) => (cur?.layers[i]?.sensors ? { ...l, sensors: cur.layers[i].sensors } : l));
      ed.setLayers(merged, 'キーボードからキーマップを読み込み', cur?.os ? inferOsDefaults(merged, cur.os) : undefined);
      const info = get().info;
      if (info) ed.replaceDevice({ name: info.name, serial: info.serial, syncedAt: Date.now() });
      set({ pendingLoad: null });
    },
    dismissPendingLoad() {
      set({ pendingLoad: null });
    },

    async apply() {
      const { dev, map } = get();
      const ed = useEditor.getState();
      if (!dev || !map || !ed.project) {
        ed.toast('error', 'キーボードが接続されていません');
        return false;
      }
      if (get().layerMismatch) {
        ed.toast('error', get().layerMismatch!);
        return false;
      }
      set({ status: 'writing', error: null, progress: { done: 0, total: 1, message: '準備中…' } });
      try {
        const res = await applyToDevice(dev, ed.project.layers, map, get().registry(), (p) => set({ progress: p }));
        // デバイスが割り当てたレイヤー ID をプロジェクトにも反映 (内容は同じ)
        const idsChanged = res.layers.some((l, i) => l.id !== ed.project!.layers[i].id);
        if (idsChanged) ed.setLayers(res.layers.map((l, i) => ({ ...l, sensors: ed.project!.layers[i]?.sensors })), 'キーボードのレイヤー ID に合わせる');
        const info = get().info;
        if (info) ed.replaceDevice({ name: info.name, serial: info.serial, syncedAt: Date.now() });
        set({ status: 'saved', deviceLayers: res.layers, progress: null });
        ed.toast('success', res.changed ? `キーボードに ${res.changed} 件の変更を書き込み、フラッシュに保存しました` : 'キーボードの内容は最新です');
        return true;
      } catch (e) {
        if (e instanceof LockedError) {
          set({ status: 'locked', progress: null });
          return false;
        }
        // 書き込み途中の変更は破棄して、保存済みの状態に戻す
        try {
          if (!dev.isClosed && (await dev.checkUnsavedChanges())) await dev.discardChanges();
        } catch {
          /* noop */
        }
        fail(e instanceof DeviceError ? e : new DeviceError(String((e as Error)?.message ?? e)));
        return false;
      }
    },

    async discard() {
      await get().dev?.discardChanges();
    },

    async resetDevice() {
      const dev = get().dev;
      if (!dev) return;
      try {
        set({ status: 'writing', progress: { done: 0, total: 1, message: 'キーボードを初期状態に戻しています…' } });
        await dev.resetSettings();
        set({ progress: null });
        await get().load();
        useEditor.getState().toast('success', 'キーボードのキーマップをファームウェアの初期状態に戻しました');
      } catch (e) {
        fail(e);
      }
    },
  };
});

/** 現在のプロジェクトとデバイスの差分件数 (接続中のみ) */
export function useDeviceDiff(): number | null {
  const deviceLayers = useDevice((s) => s.deviceLayers);
  const project = useEditor((s) => s.project);
  if (!deviceLayers || !project) return null;
  return planSize(planApply(project.layers, deviceLayers));
}

/** 現在のプロジェクト + 接続中デバイスのビヘイビア一覧 */
export function useRegistry(): Map<string, BehaviorDef> {
  const project = useEditor((s) => s.project);
  const map = useDevice((s) => s.map);
  const source = project?.keymapSource;
  const macros = project?.macros;
  const shortcuts = project?.shortcuts;
  const names = project?.runtimeNames;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => registryFor(project, deviceOnlyBehaviors(map)), [source, macros, shortcuts, names, map]);
}
