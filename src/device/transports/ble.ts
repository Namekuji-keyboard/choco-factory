/**
 * ZMK Studio RPC の Bluetooth (GATT) トランスポート — 現在はアプリから使用していません。
 *
 * 削除した理由 (調査結果):
 *  - ZMK 公式ドキュメント (docs/features/studio.md, ZMK v0.2.1) で、BLE 接続での編集は
 *    「Linux の Web アプリとネイティブアプリのみ」動作確認済みとされており、Windows / macOS の
 *    Chrome・Edge (Web Bluetooth) は対応環境に含まれていません。
 *  - 公式クライアント (transport/gatt.ts) は requestDevice({ filters: [{ services: [Studio の UUID] }] }) で
 *    デバイスを探しますが、ZMK v0.2.1 (app/src/ble.c) のアドバタイズに含まれるサービス UUID は
 *    HID (0x1812) と Battery (0x180F) だけで、Studio の UUID は含まれていません。Windows の Chrome / Edge は
 *    アドバタイズの内容でフィルタするため、スキャンしてもキーボードが一覧に表示されません。
 *  - さらに ZMK は、選択中のプロファイルが PC と接続済みのときはアドバタイズを止めます (update_advertising)。
 *    Windows に Bluetooth キーボードとして接続した状態では、そもそもスキャンに現れません。
 *  - ファームウェア側で直すには ZMK 本体 (ble.c) の改造が必要で、既存ファームウェアを壊さない方針に反するため行いません。
 *  - Windows の Bluetooth 設定でのペアリング (HID over GATT) と、ZMK Studio の RPC 通信
 *    (独自 GATT サービス 00000000-0196-6107-c967-c5cfb1c2482a) は別物で、ペアリングできても
 *    ブラウザから RPC サービスに接続できるとは限りません。
 *
 * ファームウェア側 (CONFIG_ZMK_STUDIO_TRANSPORT_BLE=y) は有効のままなので、公式のネイティブアプリ
 * (zmk.studio/download) からは BLE で接続できる可能性があります (未検証)。
 * 将来 Web Bluetooth で正式に動作するようになった場合は、このモジュールを StudioDevice.fromTransport() に
 * 渡すだけで再び使えるようにしています。
 */
import { connect as connectGatt } from '@zmkfirmware/zmk-studio-ts-client/transport/gatt';
import type { RpcTransport } from '@zmkfirmware/zmk-studio-ts-client/transport/index';

/** ZMK Studio の GATT サービス UUID (ZMK v0.2.1 app/src/studio/uuid.h) */
export const ZMK_STUDIO_GATT_SERVICE_UUID = '00000000-0196-6107-c967-c5cfb1c2482a';

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** ブラウザの Bluetooth デバイス選択を開いて GATT トランスポートを作る (公式クライアントの実装をそのまま使用) */
export function connectBleTransport(): Promise<RpcTransport> {
  return connectGatt();
}
