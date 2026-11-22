/**
 * ZMK Studio デバイスのシミュレーター。
 *
 * 実機と同じ protobuf メッセージとフレーミング (公式 ts-client の実装) で応答するため、
 * StudioDevice / 同期処理を実機なしで検証できます (自動テストと「シミュレーター接続」で使用)。
 * 振る舞いは ZMK v0.2.1 の app/src/studio/*.c に合わせています。
 */
import { Request, Response } from '@zmkfirmware/zmk-studio-ts-client/studio';
import { get_decoder, get_encoder } from '@zmkfirmware/zmk-studio-ts-client/framing';
import { LockState } from '@zmkfirmware/zmk-studio-ts-client/core';
import { ErrorConditions } from '@zmkfirmware/zmk-studio-ts-client/meta';
import type { RpcTransport } from '@zmkfirmware/zmk-studio-ts-client/transport/index';
import type { BehaviorParameterValueDescription } from '@zmkfirmware/zmk-studio-ts-client/behaviors';
import type { KeyboardDefinition } from '../model/types';
import { BUILTIN_BEHAVIORS, type ParamKind } from '../zmk/behaviors';
import { layersFromParsed, parseKeymap } from '../zmk/keymap';
import { ZMK_STUDIO_UNSUPPORTED } from './wrappers';

interface SimBinding {
  behaviorId: number;
  param1: number;
  param2: number;
}
interface SimLayer {
  id: number;
  name: string;
  bindings: SimBinding[];
}
interface SimState {
  /** 有効なレイヤー (インデックス順) */
  layers: SimLayer[];
  /** 予備 (未使用) レイヤー */
  reserved: SimLayer[];
}

export interface SimulatorOptions {
  /** この種類の要求には応答しない (タイムアウトの再現用。例: "keymap.saveChanges") */
  hangOn?: string;
  /** ファームウェアに入っているキーマップ (省略時は同梱の Studio 版) */
  keymapSource?: string;
  locked?: boolean;
  /** フラッシュの代わりに保存する先 (省略時はメモリのみ) */
  storage?: { load(): string | null; save(v: string): void; clear(): void };
}

export class StudioSimulator {
  lock: LockState;
  private stock: SimState;
  private saved: SimState;
  private live: SimState;
  private behaviors: { id: number; label: string; displayName: string; params: ParamKind[] }[];
  private emit: ((bytes: Uint8Array) => void) | null = null;
  requestLog: string[] = [];

  constructor(
    private kb: KeyboardDefinition,
    private opts: SimulatorOptions = {},
  ) {
    this.lock = opts.locked ? LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED : LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;
    const parsed = parseKeymap(opts.keymapSource ?? kb.files.studio[kb.keymapPath]);
    const defs = [...BUILTIN_BEHAVIORS, ...parsed.customBehaviors];
    // ZMK と同様、ビヘイビア ID はデバイスごとのローカル ID (ここでは連番)
    this.behaviors = defs.map((d, i) => ({ id: 100 + i, label: d.label, displayName: d.displayName, params: d.params }));
    const idOf = new Map(defs.map((d, i) => [d.label, 100 + i]));
    const layers = layersFromParsed(parsed);
    this.stock = {
      layers: layers.map((l) => ({
        id: l.id,
        name: parsed.layers[l.id].displayName ?? '',
        bindings: l.bindings.map((b) => ({ behaviorId: idOf.get(b.b) ?? 0, param1: b.p[0] ?? 0, param2: b.p[1] ?? 0 })),
      })),
      reserved: parsed.reservedLayers.map((_, i) => ({
        id: layers.length + i,
        name: '',
        bindings: kb.keys.map(() => ({ behaviorId: idOf.get('trans')!, param1: 0, param2: 0 })),
      })),
    };
    const fromFlash = opts.storage?.load();
    this.saved = fromFlash ? (JSON.parse(fromFlash) as SimState) : clone(this.stock);
    this.live = clone(this.saved);
  }

  /** キーボード上で &studio_unlock を押したときの動作 */
  pressUnlock() {
    this.lock = LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;
    this.notify({ core: { lockStateChanged: this.lock } });
  }

  /** 電源の再投入 (保存されていない変更は消える) */
  powerCycle() {
    this.live = clone(this.saved);
    if (this.opts.locked) this.lock = LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED;
  }

  get unsaved() {
    return JSON.stringify(this.live) !== JSON.stringify(this.saved);
  }

  /** 現在有効なキーマップ (テスト用) */
  get liveState(): SimState {
    return clone(this.live);
  }

  transport(): RpcTransport {
    const abortController = new AbortController();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const readable = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
      },
    });
    const encoder = get_encoder();
    this.emit = (msg: Uint8Array) => {
      encoder.transform!(msg, { enqueue: (chunk: Uint8Array) => controller.enqueue(new Uint8Array(chunk)) } as never);
    };
    const decoder = get_decoder();
    const writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        decoder.transform!(chunk, {
          enqueue: (frame: Uint8Array) => {
            const req = Request.decode(frame);
            if (this.opts.hangOn) {
              const kind = Object.entries(req)
                .filter(([k, v]) => k !== 'requestId' && v)
                .map(([k, v]) => `${k}.${Object.entries(v as object).find(([, x]) => x !== undefined && x !== false)?.[0]}`)[0];
              if (kind === this.opts.hangOn) return; // 応答しない (実機で処理が長引いた / 固まった状態の再現)
            }
            const res = this.handle(req);
            // 実機と同様に非同期で応答
            setTimeout(() => this.emit?.(Response.encode(res).finish()), 1);
          },
          error: (e: unknown) => {
            throw e;
          },
        } as never);
      },
    });
    abortController.signal.addEventListener('abort', () => {
      try {
        controller.close();
      } catch {
        /* noop */
      }
      this.emit = null;
    });
    return { label: 'Choco-Key シミュレーター', abortController, readable, writable };
  }

  private notify(n: Response['notification']) {
    if (this.emit) this.emit(Response.encode({ notification: n }).finish());
  }

  private handle(req: Request): Response {
    const requestId = req.requestId;
    const reply = (r: Omit<NonNullable<Response['requestResponse']>, 'requestId'>): Response => ({ requestResponse: { requestId, ...r } });
    const unlocked = this.lock === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;
    const denied = () => reply({ meta: { simpleError: ErrorConditions.UNLOCK_REQUIRED } });

    if (req.core) {
      this.requestLog.push('core');
      if (req.core.getDeviceInfo) return reply({ core: { getDeviceInfo: { name: this.kb.deviceNames[0], serialNumber: new Uint8Array([0xc0, 0xc0, 0xa0, 0x01]) } } });
      if (req.core.getLockState) return reply({ core: { getLockState: this.lock } });
      if (req.core.lock) {
        this.lock = LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED;
        setTimeout(() => this.notify({ core: { lockStateChanged: this.lock } }), 2);
        return reply({ meta: { noResponse: true } });
      }
      if (req.core.resetSettings) {
        if (!unlocked) return denied();
        this.saved = clone(this.stock);
        this.live = clone(this.stock);
        this.opts.storage?.clear();
        return reply({ core: { resetSettings: true } });
      }
    }
    if (req.behaviors) {
      if (req.behaviors.listAllBehaviors) return reply({ behaviors: { listAllBehaviors: { behaviors: this.behaviors.map((b) => b.id) } } });
      if (req.behaviors.getBehaviorDetails) {
        if (!unlocked) return denied();
        const b = this.behaviors.find((x) => x.id === req.behaviors!.getBehaviorDetails!.behaviorId);
        if (!b) return reply({ meta: { simpleError: ErrorConditions.GENERIC } });
        const desc = (k: ParamKind | undefined): BehaviorParameterValueDescription[] =>
          k === undefined
            ? []
            : k === 'keycode' || k === 'modifier'
              ? [{ name: 'Key', hidUsage: { keyboardMax: 0xff, consumerMax: 0xfff } }]
              : k === 'layer'
                ? [{ name: 'Layer', layerId: {} }]
                : [{ name: 'Value', range: { min: 0, max: 0x7fffffff } }];
        return reply({ behaviors: { getBehaviorDetails: { id: b.id, displayName: b.displayName, metadata: [{ param1: desc(b.params[0]), param2: desc(b.params[1]) }] } } });
      }
    }
    if (req.keymap) {
      if (!unlocked) return denied();
      const k = req.keymap;
      if (k.getKeymap) return reply({ keymap: { getKeymap: this.keymapMsg() } });
      if (k.getPhysicalLayouts) {
        return reply({
          keymap: {
            getPhysicalLayouts: {
              activeLayoutIndex: 0,
              layouts: [{ name: this.kb.name, keys: this.kb.keys.map((key) => ({ width: key.w * 100, height: key.h * 100, x: key.x * 100, y: key.y * 100, r: 0, rx: 0, ry: 0 })) }],
            },
          },
        });
      }
      if (k.setLayerBinding) {
        const { layerId, keyPosition, binding } = k.setLayerBinding;
        const layer = this.live.layers.find((l) => l.id === layerId);
        if (!layer || keyPosition < 0 || keyPosition >= layer.bindings.length) return reply({ keymap: { setLayerBinding: 1 } });
        const beh = binding && this.behaviors.find((b) => b.id === binding.behaviorId);
        if (!binding || !beh) return reply({ keymap: { setLayerBinding: 2 } });
        // ZMK v0.2.1 と同じく、パラメータ情報 (metadata) の無いビヘイビアは 0 以外のパラメータを受け付けない
        if (ZMK_STUDIO_UNSUPPORTED.has(beh.label) && (binding.param1 || binding.param2)) return reply({ keymap: { setLayerBinding: 3 } });
        layer.bindings[keyPosition] = { behaviorId: binding.behaviorId, param1: binding.param1, param2: binding.param2 };
        this.notifyUnsaved();
        return reply({ keymap: { setLayerBinding: 0 } });
      }
      if (k.checkUnsavedChanges) return reply({ keymap: { checkUnsavedChanges: this.unsaved } });
      if (k.saveChanges) {
        this.saved = clone(this.live);
        this.opts.storage?.save(JSON.stringify(this.saved));
        this.notifyUnsaved();
        return reply({ keymap: { saveChanges: { ok: true } } });
      }
      if (k.discardChanges) {
        this.live = clone(this.saved);
        this.notifyUnsaved();
        return reply({ keymap: { discardChanges: true } });
      }
      if (k.setLayerProps) {
        const layer = [...this.live.layers, ...this.live.reserved].find((l) => l.id === k.setLayerProps!.layerId);
        if (!layer) return reply({ keymap: { setLayerProps: 2 } });
        layer.name = k.setLayerProps.name.slice(0, 20);
        this.notifyUnsaved();
        return reply({ keymap: { setLayerProps: 0 } });
      }
      if (k.addLayer) {
        const next = this.live.reserved.shift();
        if (!next) return reply({ keymap: { addLayer: { err: 2 } } });
        this.live.layers.push(next);
        this.notifyUnsaved();
        return reply({ keymap: { addLayer: { ok: { index: this.live.layers.length - 1, layer: next } } } });
      }
      if (k.removeLayer) {
        const idx = k.removeLayer.layerIndex;
        if (idx >= this.live.layers.length) return reply({ keymap: { removeLayer: { err: 2 } } });
        const [removed] = this.live.layers.splice(idx, 1);
        this.live.reserved.unshift(removed);
        this.notifyUnsaved();
        return reply({ keymap: { removeLayer: { ok: {} } } });
      }
    }
    return reply({ meta: { simpleError: ErrorConditions.RPC_NOT_FOUND } });
  }

  private notifyUnsaved() {
    const u = this.unsaved;
    setTimeout(() => this.notify({ keymap: { unsavedChangesStatusChanged: u } }), 2);
  }

  private keymapMsg() {
    return {
      layers: this.live.layers.map((l) => ({ id: l.id, name: l.name, bindings: l.bindings })),
      availableLayers: this.live.reserved.length,
      maxLayerNameLength: 20,
    };
  }
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
