/**
 * ZMK Studio RPC 接続。
 *
 * 通信プロトコル (フレーミング・protobuf・トランスポート) は ZMK 公式の
 * @zmkfirmware/zmk-studio-ts-client をそのまま使用し、独自実装はしていません。
 * このモジュールはタイムアウト・エラー処理・通知の購読を追加したラッパーです。
 */
import { call_rpc, create_rpc_connection, type RpcConnection, type Notification } from '@zmkfirmware/zmk-studio-ts-client';
import type { RpcTransport } from '@zmkfirmware/zmk-studio-ts-client/transport/index';
import { connect as connectSerial } from '@zmkfirmware/zmk-studio-ts-client/transport/serial';
import { connect as connectGatt } from '@zmkfirmware/zmk-studio-ts-client/transport/gatt';
import { LockState } from '@zmkfirmware/zmk-studio-ts-client/core';
import { ErrorConditions } from '@zmkfirmware/zmk-studio-ts-client/meta';
import type { GetBehaviorDetailsResponse } from '@zmkfirmware/zmk-studio-ts-client/behaviors';
import type { Keymap, PhysicalLayouts, BehaviorBinding } from '@zmkfirmware/zmk-studio-ts-client/keymap';
import { SaveChangesErrorCode, SetLayerBindingResponse } from '@zmkfirmware/zmk-studio-ts-client/keymap';

export { LockState };
export type { Keymap, PhysicalLayouts, BehaviorBinding, GetBehaviorDetailsResponse };

export type TransportKind = 'usb' | 'ble';

export class DeviceError extends Error {}

export function isSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}
export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

type Request = Parameters<typeof call_rpc>[1];
type RequestResponse = Awaited<ReturnType<typeof call_rpc>>;

export interface DeviceInfo {
  name: string;
  serial: string;
}

export interface StudioEvents {
  onLockStateChanged?: (s: LockState) => void;
  onUnsavedChanges?: (unsaved: boolean) => void;
  onDisconnect?: (reason?: unknown) => void;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export class StudioDevice {
  private conn: RpcConnection;
  private closed = false;
  readonly label: string;
  readonly kind: TransportKind;
  timeoutMs = 5000;

  private constructor(
    private transport: RpcTransport,
    kind: TransportKind,
    private events: StudioEvents,
  ) {
    this.kind = kind;
    this.label = transport.label;
    this.conn = create_rpc_connection(transport, { signal: transport.abortController.signal });
    transport.abortController.signal.addEventListener('abort', () => this.handleClosed('abort'));
    void this.readNotifications();
  }

  /** ブラウザのデバイス選択ダイアログを開いて接続する */
  static async connect(kind: TransportKind, events: StudioEvents = {}): Promise<StudioDevice> {
    if (kind === 'usb' && !isSerialSupported()) throw new DeviceError('このブラウザは Web Serial API に対応していません。Chrome または Edge をお使いください。');
    if (kind === 'ble' && !isBluetoothSupported()) throw new DeviceError('このブラウザは Web Bluetooth API に対応していません。Chrome または Edge をお使いください。');
    const transport = kind === 'usb' ? await connectSerial() : await connectGatt();
    return new StudioDevice(transport, kind, events);
  }

  /** テスト・シミュレーター用: 任意のトランスポートで接続 */
  static fromTransport(transport: RpcTransport, kind: TransportKind, events: StudioEvents = {}): StudioDevice {
    return new StudioDevice(transport, kind, events);
  }

  get isClosed() {
    return this.closed;
  }

  private handleClosed(reason?: unknown) {
    if (this.closed) return;
    this.closed = true;
    this.events.onDisconnect?.(reason);
  }

  private async readNotifications() {
    const reader = this.conn.notification_readable.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.dispatch(value);
      }
    } catch (e) {
      this.handleClosed(e);
    } finally {
      reader.releaseLock();
      this.handleClosed('closed');
    }
  }

  private dispatch(n: Notification) {
    if (n.core?.lockStateChanged !== undefined) this.events.onLockStateChanged?.(n.core.lockStateChanged);
    if (n.keymap?.unsavedChangesStatusChanged !== undefined) this.events.onUnsavedChanges?.(n.keymap.unsavedChangesStatusChanged);
  }

  async disconnect() {
    if (this.closed) return;
    try {
      this.transport.abortController.abort('disconnect');
    } catch {
      /* noop */
    }
    this.handleClosed('disconnect');
  }

  /** RPC を呼び出す。応答が無い場合は接続を閉じてエラーにする */
  async call(req: Request, timeoutMs = this.timeoutMs): Promise<RequestResponse> {
    if (this.closed) throw new DeviceError('キーボードとの接続が切れています');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new DeviceError(
            'キーボードから応答がありません。ZMK Studio が有効なファームウェアか、セントラル側 (Choco-Key では右手) を接続しているか確認してください。',
          ),
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([call_rpc(this.conn, req), timeout]);
    } catch (e) {
      if (e instanceof DeviceError) {
        await this.disconnect();
        throw e;
      }
      if (e && typeof e === 'object' && 'condition' in e) {
        const c = (e as { condition: ErrorConditions }).condition;
        if (c === ErrorConditions.UNLOCK_REQUIRED) throw new LockedError();
        throw new DeviceError(`キーボードがエラーを返しました (${ErrorConditions[c] ?? c})`);
      }
      throw new DeviceError(`通信エラー: ${String((e as Error)?.message ?? e)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- core ----
  async getDeviceInfo(): Promise<DeviceInfo> {
    const r = await this.call({ core: { getDeviceInfo: true } });
    const info = r.core?.getDeviceInfo;
    if (!info) throw new DeviceError('デバイス情報を取得できませんでした');
    return { name: info.name, serial: toHex(info.serialNumber ?? new Uint8Array()) };
  }

  async getLockState(): Promise<LockState> {
    const r = await this.call({ core: { getLockState: true } });
    return r.core?.getLockState ?? LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED;
  }

  async lock(): Promise<void> {
    await this.call({ core: { lock: true } });
  }

  /** ファームウェアの初期キーマップに戻す (保存済みの変更をすべて削除) */
  async resetSettings(): Promise<boolean> {
    const r = await this.call({ core: { resetSettings: true } }, 15000);
    return !!r.core?.resetSettings;
  }

  // ---- behaviors ----
  async listBehaviors(): Promise<GetBehaviorDetailsResponse[]> {
    const r = await this.call({ behaviors: { listAllBehaviors: true } });
    const ids = r.behaviors?.listAllBehaviors?.behaviors ?? [];
    const out: GetBehaviorDetailsResponse[] = [];
    for (const id of ids) {
      const d = await this.call({ behaviors: { getBehaviorDetails: { behaviorId: id } } });
      if (d.behaviors?.getBehaviorDetails) out.push(d.behaviors.getBehaviorDetails);
    }
    return out;
  }

  // ---- keymap ----
  async getKeymap(): Promise<Keymap> {
    const r = await this.call({ keymap: { getKeymap: true } });
    if (!r.keymap?.getKeymap) throw new DeviceError('キーマップを取得できませんでした');
    return r.keymap.getKeymap;
  }

  async getPhysicalLayouts(): Promise<PhysicalLayouts | undefined> {
    const r = await this.call({ keymap: { getPhysicalLayouts: true } });
    return r.keymap?.getPhysicalLayouts;
  }

  async setLayerBinding(layerId: number, keyPosition: number, binding: BehaviorBinding): Promise<void> {
    const r = await this.call({ keymap: { setLayerBinding: { layerId, keyPosition, binding } } });
    const res = r.keymap?.setLayerBinding;
    if (res !== SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK) {
      const msg: Record<number, string> = {
        [SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_LOCATION]: '存在しないキー位置です',
        [SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_BEHAVIOR]: 'ファームウェアに存在しないビヘイビアです',
        [SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_PARAMETERS]: 'パラメータが不正です',
      };
      throw new DeviceError(`キー ${keyPosition + 1} の設定に失敗しました: ${msg[res ?? -1] ?? '不明なエラー'}`);
    }
  }

  async setLayerName(layerId: number, name: string): Promise<void> {
    const r = await this.call({ keymap: { setLayerProps: { layerId, name } } });
    if (r.keymap?.setLayerProps !== 0) throw new DeviceError(`レイヤー名の変更に失敗しました`);
  }

  async addLayer(): Promise<{ index: number; id: number }> {
    const r = await this.call({ keymap: { addLayer: {} } });
    const ok = r.keymap?.addLayer?.ok;
    if (!ok?.layer) throw new DeviceError('レイヤーを追加できませんでした (ファームウェアの予備レイヤーが不足しています)');
    return { index: ok.index, id: ok.layer.id };
  }

  async removeLayer(layerIndex: number): Promise<void> {
    const r = await this.call({ keymap: { removeLayer: { layerIndex } } });
    if (!r.keymap?.removeLayer?.ok) throw new DeviceError('レイヤーを削除できませんでした');
  }

  async checkUnsavedChanges(): Promise<boolean> {
    const r = await this.call({ keymap: { checkUnsavedChanges: true } });
    return !!r.keymap?.checkUnsavedChanges;
  }

  /** 変更内容をフラッシュ (不揮発メモリ) に保存 */
  async saveChanges(): Promise<void> {
    const r = await this.call({ keymap: { saveChanges: true } }, 15000);
    const res = r.keymap?.saveChanges;
    if (!res?.ok) {
      const msg: Record<number, string> = {
        [SaveChangesErrorCode.SAVE_CHANGES_ERR_NOT_SUPPORTED]: 'このファームウェアは保存に対応していません',
        [SaveChangesErrorCode.SAVE_CHANGES_ERR_NO_SPACE]: 'フラッシュの空き容量が不足しています',
      };
      throw new DeviceError(`フラッシュへの保存に失敗しました: ${msg[res?.err ?? -1] ?? '不明なエラー'}`);
    }
  }

  async discardChanges(): Promise<void> {
    await this.call({ keymap: { discardChanges: true } });
  }
}

export class LockedError extends DeviceError {
  constructor() {
    super('キーボードがロックされています。キーボード上の &studio_unlock キーを押してロックを解除してください。');
  }
}
