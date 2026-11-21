import { RAW_KEYCODES } from './keycodes.generated';
import { keycodeDescriptionJa } from './keycodes.ja';

/**
 * ZMK のキーコード (HID usage) の表示・検索・分類。
 * 値の形式: (修飾キー 8bit << 24) | (usage page << 16) | usage id   … ZMK の keys.h / modifiers.h と同一
 */

export type KeycodeCategory =
  | 'letters'
  | 'numbers'
  | 'symbols'
  | 'function'
  | 'modifiers'
  | 'basic'
  | 'navigation'
  | 'media'
  | 'volume'
  | 'keypad'
  | 'international'
  | 'apps'
  | 'system'
  | 'other';

export const KEYCODE_CATEGORY_LABELS: Record<KeycodeCategory, string> = {
  letters: 'A〜Z',
  numbers: '0〜9',
  symbols: '記号',
  function: 'F1〜F24',
  modifiers: '修飾キー',
  basic: '基本キー',
  navigation: '矢印・移動',
  media: 'メディア',
  volume: '音量',
  keypad: 'テンキー',
  international: '日本語・国際',
  apps: 'アプリ・ブラウザ',
  system: 'システム・電源',
  other: 'その他',
};

export interface Keycode {
  /** keys.h に定義された名前 (先頭が正式名、以降は別名) */
  names: string[];
  value: number;
  /** keys.h のコメント (英語の説明) */
  comment: string;
  category: KeycodeCategory;
}

export const MOD_BITS = {
  LCTL: 0x01,
  LSFT: 0x02,
  LALT: 0x04,
  LGUI: 0x08,
  RCTL: 0x10,
  RSFT: 0x20,
  RALT: 0x40,
  RGUI: 0x80,
} as const;

/** 修飾キー関数 (keymap 内で LC(X) のように書くもの) */
export const MOD_FUNCS: { fn: string; bit: number; label: string; short: string }[] = [
  { fn: 'LC', bit: 0x01, label: '左Ctrl', short: 'Ctrl' },
  { fn: 'LS', bit: 0x02, label: '左Shift', short: 'Shift' },
  { fn: 'LA', bit: 0x04, label: '左Alt', short: 'Alt' },
  { fn: 'LG', bit: 0x08, label: '左GUI', short: 'Win' },
  { fn: 'RC', bit: 0x10, label: '右Ctrl', short: 'RCtrl' },
  { fn: 'RS', bit: 0x20, label: '右Shift', short: 'RShift' },
  { fn: 'RA', bit: 0x40, label: '右Alt', short: 'RAlt' },
  { fn: 'RG', bit: 0x80, label: '右GUI', short: 'RWin' },
];

export const usagePage = (v: number) => (v >>> 16) & 0xff;
export const usageId = (v: number) => v & 0xffff;
export const modsOf = (v: number) => (v >>> 24) & 0xff;
export const stripMods = (v: number) => v & 0x00ffffff;
export const applyMods = (mods: number, v: number) => ((mods & 0xff) << 24 | stripMods(v)) >>> 0;

function categorize(value: number, comment: string): KeycodeCategory {
  const page = usagePage(value);
  const id = usageId(value);
  const mods = modsOf(value);
  const c = comment.toLowerCase();
  if (page === 0x07) {
    if (mods) return 'symbols'; // keys.h 内の Shift 付き記号 (EXCL = LS(N1) など)
    if (id >= 0x04 && id <= 0x1d) return 'letters';
    if (id >= 0x1e && id <= 0x27) return 'numbers';
    if ([0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x39, 0x46, 0x47, 0x48, 0x49, 0x4c, 0x65].includes(id)) return 'basic';
    if ((id >= 0x2d && id <= 0x38) || id === 0x64) return 'symbols';
    if ((id >= 0x3a && id <= 0x45) || (id >= 0x68 && id <= 0x73)) return 'function';
    if ([0x4a, 0x4b, 0x4d, 0x4e, 0x4f, 0x50, 0x51, 0x52].includes(id)) return 'navigation';
    if ((id >= 0x53 && id <= 0x63) || id === 0x67 || id === 0x85 || id === 0x86 || (id >= 0xb0 && id <= 0xdd)) return 'keypad';
    if (id >= 0x87 && id <= 0x98) return 'international';
    if (id >= 0xe0 && id <= 0xe7) return 'modifiers';
    if (id >= 0x7f && id <= 0x81) return 'volume';
    if (/volume|mute/.test(c)) return 'volume';
    if (/play|pause|next|previous|prev|stop|eject|rewind|forward|media/.test(c)) return 'media';
    if (/power|sleep|wake|lock/.test(c)) return 'system';
    return 'other';
  }
  if (page === 0x0c) {
    if (/volume|mute|bass|treble|loudness/.test(c)) return 'volume';
    if (/brightness|backlight|illumination|power|sleep|eject|lock|screen ?saver|logoff|log off/.test(c)) return 'system';
    if (/play|pause|next|previous|stop|rewind|fast forward|record|track|random|repeat|slow|media|channel|shuffle|scan/.test(c)) return 'media';
    if (/\bal\b|launch|\bac\b|browser|calculator|mail|email|search|home|back|forward|refresh|bookmark|file|explorer|word|spreadsheet|presentation|application|consumer al|consumer ac|ac |al |keyboard layout|globe|zoom|scroll|pan|undo|redo|cut|copy|paste|find|print|save|open|close|new|exit|properties|help|menu|desktop|task|control|calendar|news|chat|music|movie|photo|contact|journal|voicemail/.test(c)) return 'apps';
    return 'other';
  }
  if (page === 0x01) return 'system';
  return 'other';
}

export const KEYCODES: Keycode[] = RAW_KEYCODES.map((k) => ({
  names: k.names,
  value: k.value >>> 0,
  comment: k.comment,
  category: categorize(k.value >>> 0, k.comment),
}));

const byValue = new Map<number, Keycode>();
const byName = new Map<string, Keycode>();
for (const k of KEYCODES) {
  if (!byValue.has(k.value)) byValue.set(k.value, k);
  for (const n of k.names) byName.set(n, k);
}

export const keycodeByValue = (v: number) => byValue.get(v >>> 0);
export const keycodeByName = (n: string) => byName.get(n);

/** エクスポート時に使う名前: キーマップで一般的な短い名前を優先 */
const PREFERRED_NAMES: Record<string, string> = {
  LEFT_CONTROL: 'LCTRL',
  RIGHT_CONTROL: 'RCTRL',
  LEFT_SHIFT: 'LSHFT',
  RIGHT_SHIFT: 'RSHFT',
  LEFT_ALT: 'LALT',
  RIGHT_ALT: 'RALT',
  LEFT_GUI: 'LGUI',
  RIGHT_GUI: 'RGUI',
};

export function preferredName(k: Keycode): string {
  if (PREFERRED_NAMES[k.names[0]] && k.names.includes(PREFERRED_NAMES[k.names[0]])) return PREFERRED_NAMES[k.names[0]];
  // keys.h は「正式名, よく使う短縮名, その他の別名」の順に定義されている。
  // 正式名が短ければそのまま (GRAVE, SPACE, SLASH)、長ければ短縮名 (ESCAPE → ESC, NUMBER_1 → N1)
  if (k.names[0].length <= 5 || k.names.length === 1) return k.names[0];
  return k.names[1];
}

/** HID usage 値を ZMK キーマップの表記に変換 (例: 0x01070006 → LC(C)) */
export function formatKeycode(value: number): string {
  const v = value >>> 0;
  const exact = keycodeByValue(v);
  if (exact) return preferredName(exact);
  const mods = modsOf(v);
  const base = keycodeByValue(stripMods(v));
  if (!base) return `0x${v.toString(16).toUpperCase().padStart(8, '0')}`;
  let s = preferredName(base);
  // 内側から: 右手系 → 左手系の順に包むと、LC(LS(X)) のような一般的な並びになる
  for (const m of [...MOD_FUNCS].reverse()) {
    if (mods & m.bit) s = `${m.fn}(${s})`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// 表示ラベル
// ---------------------------------------------------------------------------

/** キーキャップに表示する短いラベル (US 配列) */
const LABELS: Record<number, string> = {};
const L = (name: string, label: string) => {
  const k = keycodeByName(name);
  if (k) LABELS[k.value] = label;
};
for (let i = 0; i < 26; i++) L(String.fromCharCode(65 + i), String.fromCharCode(65 + i));
for (let i = 0; i <= 9; i++) L(`N${i}`, String(i));
for (let i = 1; i <= 24; i++) L(`F${i}`, `F${i}`);
for (let i = 0; i <= 9; i++) L(`KP_N${i}`, `${i}`);
(
  [
    ['RET', 'Enter'], ['ESC', 'Esc'], ['BSPC', 'BkSp'], ['TAB', 'Tab'], ['SPACE', 'Space'],
    ['MINUS', '-'], ['EQUAL', '='], ['LBKT', '['], ['RBKT', ']'], ['BSLH', '\\'], ['NUHS', '#~'],
    ['SEMI', ';'], ['SQT', "'"], ['GRAVE', '`'], ['COMMA', ','], ['DOT', '.'], ['FSLH', '/'], ['NUBS', '\\|'],
    ['CAPS', 'Caps'], ['PSCRN', 'PrtSc'], ['SLCK', 'ScrLk'], ['PAUSE_BREAK', 'Pause'], ['INS', 'Ins'],
    ['HOME', 'Home'], ['PG_UP', 'PgUp'], ['DEL', 'Del'], ['END', 'End'], ['PG_DN', 'PgDn'],
    ['RIGHT', '→'], ['LEFT', '←'], ['DOWN', '↓'], ['UP', '↑'],
    ['KP_NUM', 'NumLk'], ['KP_SLASH', '/'], ['KP_MULTIPLY', '*'], ['KP_MINUS', '-'], ['KP_PLUS', '+'],
    ['KP_ENTER', 'Enter'], ['KP_DOT', '.'], ['KP_EQUAL', '='], ['KP_COMMA', ','],
    ['K_APP', 'Menu'], ['LCTRL', 'Ctrl'], ['LSHFT', 'Shift'], ['LALT', 'Alt'], ['LGUI', 'Win'],
    ['RCTRL', 'RCtrl'], ['RSHFT', 'RShift'], ['RALT', 'RAlt'], ['RGUI', 'RWin'],
    ['EXCL', '!'], ['AT', '@'], ['HASH', '#'], ['DLLR', '$'], ['PRCNT', '%'], ['CARET', '^'], ['AMPS', '&'],
    ['ASTRK', '*'], ['LPAR', '('], ['RPAR', ')'], ['UNDER', '_'], ['PLUS', '+'], ['LBRC', '{'], ['RBRC', '}'],
    ['PIPE', '|'], ['TILDE', '~'], ['COLON', ':'], ['DQT', '"'], ['LT', '<'], ['GT', '>'], ['QMARK', '?'],
    ['TILDE2', '~'], ['PIPE2', '|'],
    ['INT1', 'Int1'], ['INT2', 'Int2'], ['INT3', 'Int3'], ['INT4', 'Int4'], ['INT5', 'Int5'],
    ['LANG1', 'Lang1'], ['LANG2', 'Lang2'],
    ['C_VOL_UP', 'Vol+'], ['C_VOL_DN', 'Vol-'], ['C_MUTE', 'Mute'], ['K_VOL_UP', 'Vol+'], ['K_VOL_DN', 'Vol-'], ['K_MUTE', 'Mute'],
    ['C_PP', '⏯'], ['C_NEXT', '⏭'], ['C_PREV', '⏮'], ['C_STOP', '⏹'], ['C_FF', '⏩'], ['C_RW', '⏪'], ['C_EJECT', '⏏'],
    ['C_BRI_UP', '明+'], ['C_BRI_DN', '明-'], ['C_PWR', 'Power'], ['C_SLEEP', 'Sleep'],
    ['K_UNDO', 'Undo'], ['K_CUT', 'Cut'], ['K_COPY', 'Copy'], ['K_PASTE', 'Paste'], ['K_FIND', 'Find'],
  ] as [string, string][]
).forEach(([n, l]) => L(n, l));

/** JIS 配列ホストで印字と一致するラベル (キーの物理位置で決まる) */
const JIS_BASE: Record<string, string> = {
  GRAVE: '半/全', EQUAL: '^', LBKT: '@', RBKT: '[', NUHS: ']', BSLH: ']', SQT: ':', SEMI: ';',
  INT1: '\\ ろ', INT2: 'かな', INT3: '¥', INT4: '変換', INT5: '無変換', LANG1: 'かな', LANG2: '英数',
};
/** JIS 配列ホストで Shift を押したときの記号 */
const JIS_SHIFTED: Record<string, string> = {
  N1: '!', N2: '"', N3: '#', N4: '$', N5: '%', N6: '&', N7: "'", N8: '(', N9: ')', MINUS: '=', EQUAL: '~',
  INT3: '|', LBKT: '`', RBKT: '{', SEMI: '+', SQT: '*', NUHS: '}', BSLH: '}', COMMA: '<', DOT: '>', FSLH: '?', INT1: '_',
};
/** US 配列ホストで Shift を押したときの記号 */
const US_SHIFTED: Record<string, string> = {
  N1: '!', N2: '@', N3: '#', N4: '$', N5: '%', N6: '^', N7: '&', N8: '*', N9: '(', N0: ')', MINUS: '_', EQUAL: '+',
  LBKT: '{', RBKT: '}', BSLH: '|', SEMI: ':', SQT: '"', GRAVE: '~', COMMA: '<', DOT: '>', FSLH: '?',
};

export type HostLayout = 'us' | 'jis';

function nameForValue(v: number): string | undefined {
  const k = keycodeByValue(v);
  if (!k) return undefined;
  // JIS/US テーブルは短い別名で引くので、別名の中から一致するものを探す
  for (const n of k.names) if (n in JIS_BASE || n in JIS_SHIFTED || n in US_SHIFTED) return n;
  return k.names[0];
}

function baseLabel(v: number, host: HostLayout): string {
  if (host === 'jis') {
    const n = nameForValue(v);
    if (n && JIS_BASE[n]) return JIS_BASE[n];
  }
  if (LABELS[v]) return LABELS[v];
  const k = keycodeByValue(v);
  if (!k) return `0x${v.toString(16)}`;
  return prettifyName(preferredName(k));
}

function prettifyName(n: string): string {
  return n
    .replace(/^C_AC_/, '')
    .replace(/^C_AL_/, '')
    .replace(/^C_/, '')
    .replace(/^K_/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** キーキャップ表示用ラベル。修飾キー付きは "Ctrl+C" の形式 */
export function keycodeLabel(value: number, host: HostLayout = 'us'): string {
  const v = value >>> 0;
  const mods = modsOf(v);
  const base = stripMods(v);
  // Shift のみの組み合わせはホスト配列の記号として表示
  if (mods === MOD_BITS.LSFT || mods === MOD_BITS.RSFT) {
    const n = nameForValue(base);
    if (n) {
      const table = host === 'jis' ? JIS_SHIFTED : US_SHIFTED;
      if (table[n]) return table[n];
    }
  }
  if (host === 'us' && LABELS[v]) return LABELS[v];
  if (mods === 0) return baseLabel(base, host);
  const prefix = MOD_FUNCS.filter((m) => mods & m.bit).map((m) => m.short).join('+');
  return `${prefix}+${baseLabel(base, host)}`;
}

/** 検索用テキスト */
export function keycodeSearchText(k: Keycode): string {
  return [...k.names, k.comment, keycodeDescriptionJa(k), keycodeLabel(k.value), keycodeLabel(k.value, 'jis'), KEYCODE_CATEGORY_LABELS[k.category]]
    .join(' ')
    .toLowerCase();
}

export const MODIFIER_KEYCODES = ['LCTRL', 'LSHFT', 'LALT', 'LGUI', 'RCTRL', 'RSHFT', 'RALT', 'RGUI'].map((n) => keycodeByName(n)!);
