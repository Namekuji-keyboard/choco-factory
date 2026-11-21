/**
 * ショートカット (複数キーの同時押し)。
 *
 * ZMK での実現方法:
 *  - 修飾キー + 通常キー 1 個 (Ctrl+Shift+V など) → &kp LC(LS(V))。ZMK Studio で直接書き込めます。
 *  - 修飾キーのみ (Ctrl+Shift など)                → &kp LC(LSHFT)。ZMK Studio で直接書き込めます。
 *  - 通常キーを 2 個以上含む (A+B など)            → マクロ (&macro_press … &macro_pause_for_release … &macro_release)。
 *    ZMK Studio はマクロを作成できないため、ファイル出力 → ファームウェアのビルドが必要です。
 *  - 通常キーの同時押しは 6 個まで (ZMK の既定の HID レポートは 6 キーロールオーバー)。
 */
import type { Binding, OsId, ShortcutDef } from './types';
import { applyMods, formatKeycode, keycodeByName, keycodeByValue, keycodeLabel, modsOf, stripMods, usageId, usagePage, type HostLayout } from '../zmk/keycodes';
import type { BehaviorDef } from '../zmk/behaviors';

/** ZMK v0.2.1 の既定 (CONFIG_ZMK_HID_KEYBOARD_REPORT_SIZE = 6) */
export const MAX_NORMAL_KEYS = 6;

/** 修飾キーのキーコードなら修飾ビットを返す */
export function modifierBit(v: number): number {
  const s = stripMods(v);
  if (usagePage(s) === 0x07 && usageId(s) >= 0xe0 && usageId(s) <= 0xe7) return 1 << (usageId(s) - 0xe0);
  return 0;
}

export type ShortcutKind = 'kp' | 'macro' | 'invalid';

export interface ResolvedShortcut {
  kind: ShortcutKind;
  binding?: Binding;
  error?: string;
  /** 修飾ビット / 通常キー */
  mods: number;
  normal: number[];
}

export const shortcutMacroLabel = (s: Pick<ShortcutDef, 'id'>) => `sc_${s.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase()}`;

export function resolveShortcut(s: Pick<ShortcutDef, 'id' | 'keys'>): ResolvedShortcut {
  let mods = 0;
  const normal: number[] = [];
  const modKeys: number[] = [];
  for (const k of s.keys) {
    const bit = modifierBit(k);
    if (bit && modsOf(k) === 0) {
      mods |= bit;
      modKeys.push(k);
    } else {
      mods |= modsOf(k);
      normal.push(stripMods(k));
    }
  }
  const base = { mods, normal };
  if (!s.keys.length) return { ...base, kind: 'invalid', error: 'キーが登録されていません' };
  const seen = new Set<number>();
  for (const k of s.keys) {
    if (seen.has(k >>> 0)) return { ...base, kind: 'invalid', error: '同じキーが 2 回登録されています' };
    seen.add(k >>> 0);
  }
  if (normal.length > MAX_NORMAL_KEYS) {
    return { ...base, kind: 'invalid', error: `修飾キー以外のキーは同時に ${MAX_NORMAL_KEYS} 個までです (ZMK の 6 キーロールオーバーの制限)` };
  }
  if (normal.length === 0) {
    // 修飾キーのみ: 最後の修飾キーを本体に、残りを修飾として付ける (例: &kp LC(LSHFT))
    const last = modKeys[modKeys.length - 1];
    return { ...base, kind: 'kp', binding: { b: 'kp', p: [applyMods(mods & ~modifierBit(last), last)] } };
  }
  if (normal.length === 1) return { ...base, kind: 'kp', binding: { b: 'kp', p: [applyMods(mods, normal[0])] } };
  return { ...base, kind: 'macro', binding: { b: shortcutMacroLabel(s), p: [] } };
}

export function shortcutText(keys: number[], host: HostLayout): string {
  return keys.map((k) => keycodeLabel(k, host)).join(' + ');
}

/** 通常キーを 2 個以上含むショートカットのマクロ定義 */
export function shortcutMacroDefinition(s: ShortcutDef): string {
  const label = shortcutMacroLabel(s);
  const keys = s.keys.map((k) => `&kp ${formatKeycode(k)}`).join(' ');
  const rev = [...s.keys].reverse().map((k) => `&kp ${formatKeycode(k)}`).join(' ');
  return `${label}: ${label} {
    compatible = "zmk,behavior-macro";
    #binding-cells = <0>;
    display-name = "${label}";
    wait-ms = <0>;
    tap-ms = <0>;
    // ${s.name.replace(/[\r\n*/]/g, ' ')}: すべて押す → キーを離すまで待つ → すべて離す
    bindings = <&macro_press ${keys}>, <&macro_pause_for_release>, <&macro_release ${rev}>;
};`;
}

export function shortcutBehaviors(list: ShortcutDef[] = []): BehaviorDef[] {
  return list
    .filter((s) => resolveShortcut(s).kind === 'macro')
    .map((s) => ({
      label: shortcutMacroLabel(s),
      displayName: shortcutMacroLabel(s),
      nameJa: s.name,
      description: 'このアプリで作成したショートカット (複数キーの同時押しマクロ。ファームウェアのビルドが必要)',
      params: [],
      group: 'custom' as const,
      custom: true,
      compatible: 'zmk,behavior-macro',
      definition: shortcutMacroDefinition(s),
    }));
}

/** バインディングに一致するショートカット (表示用) */
export function findShortcutFor(b: Binding, list: ShortcutDef[] = [], os?: OsId): ShortcutDef | undefined {
  const cand = list.filter((s) => {
    const r = resolveShortcut(s);
    return r.binding && r.binding.b === b.b && r.binding.p.length === b.p.length && r.binding.p.every((v, i) => v >>> 0 === b.p[i] >>> 0);
  });
  return cand.find((s) => s.os === os) ?? cand.find((s) => s.os === 'all') ?? cand[0];
}

// ---------------------------------------------------------------------------
// プリセット
// ---------------------------------------------------------------------------

export interface ShortcutPreset {
  name: string;
  keys: string[];
  note?: string;
}

const P = (name: string, keys: string, note?: string): ShortcutPreset => ({ name, keys: keys.split('+'), note });

export const SHORTCUT_PRESETS: Record<OsId, ShortcutPreset[]> = {
  windows: [
    P('コピー', 'LCTRL+C'),
    P('貼り付け', 'LCTRL+V'),
    P('切り取り', 'LCTRL+X'),
    P('元に戻す', 'LCTRL+Z'),
    P('やり直し', 'LCTRL+Y'),
    P('すべて選択', 'LCTRL+A'),
    P('保存', 'LCTRL+S'),
    P('名前を付けて保存', 'LCTRL+LSHFT+S', 'アプリによっては F12 など別のキーです'),
    P('検索', 'LCTRL+F'),
    P('置換', 'LCTRL+H', 'アプリにより異なります'),
    P('タブ・ウィンドウを閉じる', 'LCTRL+W'),
    P('新しいタブ', 'LCTRL+T'),
    P('閉じたタブを再度開く', 'LCTRL+LSHFT+T'),
    P('次のタブ', 'LCTRL+TAB'),
    P('前のタブ', 'LCTRL+LSHFT+TAB'),
    P('セキュリティ画面', 'LCTRL+LALT+DEL'),
    P('デスクトップ表示', 'LGUI+D'),
    P('エクスプローラー', 'LGUI+E'),
    P('画面切り取り', 'LGUI+LSHFT+S'),
    P('書式なしで貼り付け', 'LCTRL+LSHFT+V', '対応アプリのみ'),
  ],
  macos: [
    P('コピー', 'LGUI+C'),
    P('貼り付け', 'LGUI+V'),
    P('切り取り', 'LGUI+X'),
    P('元に戻す', 'LGUI+Z'),
    P('やり直し', 'LGUI+LSHFT+Z'),
    P('すべて選択', 'LGUI+A'),
    P('保存', 'LGUI+S'),
    P('名前を付けて保存', 'LGUI+LSHFT+S', 'アプリにより異なります'),
    P('検索', 'LGUI+F'),
    P('ウィンドウ・タブを閉じる', 'LGUI+W'),
    P('新しいタブ', 'LGUI+T'),
    P('閉じたタブを再度開く', 'LGUI+LSHFT+T'),
    P('アプリ切り替え', 'LGUI+TAB'),
    P('Spotlight', 'LGUI+SPACE'),
    P('範囲指定スクリーンショット', 'LGUI+LSHFT+N4'),
    P('スクリーンショット・画面収録', 'LGUI+LSHFT+N5'),
  ],
  linux: [
    P('コピー', 'LCTRL+C'),
    P('貼り付け', 'LCTRL+V'),
    P('切り取り', 'LCTRL+X'),
    P('元に戻す', 'LCTRL+Z'),
    P('やり直し', 'LCTRL+Y', '対応アプリのみ (Ctrl+Shift+Z のアプリもあります)'),
    P('すべて選択', 'LCTRL+A'),
    P('保存', 'LCTRL+S'),
    P('名前を付けて保存', 'LCTRL+LSHFT+S'),
    P('検索', 'LCTRL+F'),
    P('ターミナル起動', 'LCTRL+LALT+T', 'デスクトップ環境によります (Ubuntu など)'),
    P('ウィンドウ切り替え', 'LALT+TAB'),
    P('書式なしで貼り付け', 'LCTRL+LSHFT+V', '対応アプリのみ'),
  ],
  ios: [
    P('コピー', 'LGUI+C'),
    P('貼り付け', 'LGUI+V'),
    P('切り取り', 'LGUI+X'),
    P('元に戻す', 'LGUI+Z'),
    P('やり直し', 'LGUI+LSHFT+Z'),
    P('すべて選択', 'LGUI+A'),
    P('検索', 'LGUI+F', '対応アプリのみ'),
    P('アプリ切り替え', 'LGUI+TAB'),
    P('検索 (Spotlight)', 'LGUI+SPACE'),
  ],
  android: [
    P('コピー', 'LCTRL+C'),
    P('貼り付け', 'LCTRL+V'),
    P('切り取り', 'LCTRL+X'),
    P('元に戻す', 'LCTRL+Z', '対応アプリのみ'),
    P('すべて選択', 'LCTRL+A'),
    P('検索', 'LCTRL+F', '対応アプリのみ'),
    P('次のタブ', 'LCTRL+TAB', '対応アプリのみ'),
  ],
};

export function presetKeys(p: ShortcutPreset): number[] {
  return p.keys.map((n) => {
    const k = keycodeByName(n);
    if (!k) throw new Error(`unknown key ${n}`);
    return k.value;
  });
}

export const isKnownKey = (v: number) => !!keycodeByValue(stripMods(v));
