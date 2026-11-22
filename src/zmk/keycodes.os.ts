/**
 * キーコードの OS ごとの対応状況 (ZMK 公式のキーコード一覧の OS 列)。
 * ZMK が送るキーコード (HID usage) と、各 OS が実際にそれをどう扱うかは別物なので、
 * 「キーコードの定義」(keys.h) とは分けて管理している。
 */
import type { Binding, OsId } from '../model/types';
import type { BehaviorDef } from './behaviors';
import { KEYCODE_OS_SUPPORT } from './keycodes.os.generated';
import { keycodeByValue, keycodeLabel, stripMods, type Keycode } from './keycodes';

const OS_COLUMN: Record<OsId, number> = { windows: 0, linux: 1, android: 2, macos: 3, ios: 4 };

/** true = 動作確認済み / false = 動作しない / null = 未確認・不明 */
export type OsSupport = boolean | null;

export function keycodeOsSupport(k: Pick<Keycode, 'names'> | undefined, os: OsId): OsSupport {
  if (!k) return null;
  for (const n of k.names) {
    const row = KEYCODE_OS_SUPPORT[n];
    if (row) return row[OS_COLUMN[os]] ?? null;
  }
  return null;
}

export const valueOsSupport = (value: number, os: OsId): OsSupport => keycodeOsSupport(keycodeByValue(stripMods(value)), os);

/** バインディングに含まれる、その OS で動作しないキーコード */
export function bindingOsProblems(b: Binding, os: OsId, registry: Map<string, BehaviorDef>, host: 'us' | 'jis' = 'jis'): string[] {
  const def = registry.get(b.b);
  if (!def || b.raw !== undefined) return [];
  const out: string[] = [];
  def.params.forEach((kind, i) => {
    if ((kind === 'keycode' || kind === 'modifier') && b.p[i] !== undefined && valueOsSupport(b.p[i], os) === false) out.push(keycodeLabel(b.p[i], host));
  });
  return out;
}
