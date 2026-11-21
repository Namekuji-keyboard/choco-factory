/**
 * ロータリーエンコーダーの動作プリセット。
 *
 * ZMK v0.2.1 ではエンコーダーの割り当てはレイヤーごとの sensor-bindings で指定し、
 * 時計回り / 反時計回りの動作は zmk,behavior-sensor-rotate の bindings (1 番目 = 時計回り) で決まります。
 * ZMK Studio は sensor-bindings の編集に対応していないため、ファイル出力 → ファームウェアのビルドで反映します。
 */
import type { Binding, OsId } from './types';
import { applyMods, keycodeByName, type HostLayout } from '../zmk/keycodes';
import { mouseScrolls } from '../zmk/behaviors';

export interface EncoderActionPreset {
  id: string;
  group: string;
  name: string;
  note?: string;
  /** OS とホストのキーボード配列に応じたバインディング */
  binding: (os: OsId, host: HostLayout, scrollVal: number) => Binding;
}

const kc = (name: string) => keycodeByName(name)!.value;
const MODS: Record<string, number> = { C: 0x01, S: 0x02, A: 0x04, G: 0x08 };
/** "C+S+TAB" のような表記 → &kp */
const kp = (spec: string): Binding => {
  const parts = spec.split('+');
  const key = parts.pop()!;
  const mods = parts.reduce((m, p) => m | MODS[p], 0);
  return { b: 'kp', p: [applyMods(mods, kc(key))] };
};
const apple = (os: OsId) => os === 'macos' || os === 'ios';
/** Windows / Linux / Android は Ctrl、macOS / iOS は Command (GUI) */
const cmd = (os: OsId, key: string) => kp(`${apple(os) ? 'G' : 'C'}+${key}`);

export const ENCODER_ACTIONS: EncoderActionPreset[] = [
  // 音量・メディア
  { id: 'vol_up', group: '音量・メディア', name: '音量アップ', binding: () => kp('C_VOLUME_UP') },
  { id: 'vol_dn', group: '音量・メディア', name: '音量ダウン', binding: () => kp('C_VOLUME_DOWN') },
  { id: 'mute', group: '音量・メディア', name: 'ミュート', binding: () => kp('C_MUTE') },
  { id: 'next', group: '音量・メディア', name: '次の曲', binding: () => kp('C_NEXT') },
  { id: 'prev', group: '音量・メディア', name: '前の曲', binding: () => kp('C_PREVIOUS') },
  { id: 'pp', group: '音量・メディア', name: '再生 / 一時停止', binding: () => kp('C_PLAY_PAUSE') },
  { id: 'stop', group: '音量・メディア', name: '停止', binding: () => kp('C_STOP') },
  // ブラウザ
  { id: 'scr_up', group: 'ブラウザ', name: '上スクロール', binding: (_o, _h, v) => ({ b: 'msc', p: [mouseScrolls(v)[0].value] }) },
  { id: 'scr_dn', group: 'ブラウザ', name: '下スクロール', binding: (_o, _h, v) => ({ b: 'msc', p: [mouseScrolls(v)[1].value] }) },
  { id: 'scr_l', group: 'ブラウザ', name: '左スクロール', binding: (_o, _h, v) => ({ b: 'msc', p: [mouseScrolls(v)[2].value] }) },
  { id: 'scr_r', group: 'ブラウザ', name: '右スクロール', binding: (_o, _h, v) => ({ b: 'msc', p: [mouseScrolls(v)[3].value] }) },
  { id: 'zoom_in', group: 'ブラウザ', name: 'ページの拡大', note: 'Ctrl (Mac は ⌘) + テンキーの +', binding: (o) => cmd(o, 'KP_PLUS') },
  { id: 'zoom_out', group: 'ブラウザ', name: 'ページの縮小', note: 'Ctrl (Mac は ⌘) + テンキーの -', binding: (o) => cmd(o, 'KP_MINUS') },
  { id: 'tab_next', group: 'ブラウザ', name: '次のタブ', note: 'Ctrl + Tab (macOS のブラウザも同じ)', binding: () => kp('C+TAB') },
  { id: 'tab_prev', group: 'ブラウザ', name: '前のタブ', note: 'Ctrl + Shift + Tab', binding: () => kp('C+S+TAB') },
  { id: 'tab_new', group: 'ブラウザ', name: '新しいタブ', binding: (o) => cmd(o, 'T') },
  { id: 'tab_close', group: 'ブラウザ', name: 'タブを閉じる', binding: (o) => cmd(o, 'W') },
  { id: 'back', group: 'ブラウザ', name: 'ページを戻る', note: 'Alt + ← (Mac は ⌘ + ←)', binding: (o) => (apple(o) ? kp('G+LEFT') : kp('A+LEFT')) },
  { id: 'fwd', group: 'ブラウザ', name: 'ページを進む', note: 'Alt + → (Mac は ⌘ + →)', binding: (o) => (apple(o) ? kp('G+RIGHT') : kp('A+RIGHT')) },
  // テキスト・プログラミング
  { id: 'right', group: 'テキスト・プログラミング', name: 'カーソルを右へ', binding: () => kp('RIGHT') },
  { id: 'left', group: 'テキスト・プログラミング', name: 'カーソルを左へ', binding: () => kp('LEFT') },
  { id: 'up', group: 'テキスト・プログラミング', name: 'カーソルを上へ', binding: () => kp('UP') },
  { id: 'down', group: 'テキスト・プログラミング', name: 'カーソルを下へ', binding: () => kp('DOWN') },
  { id: 'word_next', group: 'テキスト・プログラミング', name: '次の単語へ', note: 'Ctrl + → (Mac は Option + →)', binding: (o) => (apple(o) ? kp('A+RIGHT') : kp('C+RIGHT')) },
  { id: 'word_prev', group: 'テキスト・プログラミング', name: '前の単語へ', note: 'Ctrl + ← (Mac は Option + ←)', binding: (o) => (apple(o) ? kp('A+LEFT') : kp('C+LEFT')) },
  { id: 'home', group: 'テキスト・プログラミング', name: 'Home (行頭)', note: 'Mac は ⌘ + ←', binding: (o) => (apple(o) ? kp('G+LEFT') : kp('HOME')) },
  { id: 'end', group: 'テキスト・プログラミング', name: 'End (行末)', note: 'Mac は ⌘ + →', binding: (o) => (apple(o) ? kp('G+RIGHT') : kp('END')) },
  { id: 'pgup', group: 'テキスト・プログラミング', name: 'Page Up', binding: () => kp('PAGE_UP') },
  { id: 'pgdn', group: 'テキスト・プログラミング', name: 'Page Down', binding: () => kp('PAGE_DOWN') },
  { id: 'undo', group: 'テキスト・プログラミング', name: '元に戻す (Undo)', binding: (o) => cmd(o, 'Z') },
  {
    id: 'redo',
    group: 'テキスト・プログラミング',
    name: 'やり直し (Redo)',
    note: 'Windows: Ctrl+Y / Linux・Android: Ctrl+Shift+Z / Mac: ⌘+Shift+Z',
    binding: (o) => (o === 'windows' ? kp('C+Y') : apple(o) ? kp('G+S+Z') : kp('C+S+Z')),
  },
  // CAD・画像編集・動画編集
  { id: 'cad_zoom_in', group: 'CAD・画像・動画編集', name: 'ズームイン', note: 'アプリにより異なります (Ctrl / ⌘ + テンキーの +)', binding: (o) => cmd(o, 'KP_PLUS') },
  { id: 'cad_zoom_out', group: 'CAD・画像・動画編集', name: 'ズームアウト', note: 'アプリにより異なります (Ctrl / ⌘ + テンキーの -)', binding: (o) => cmd(o, 'KP_MINUS') },
  { id: 'tl_right', group: 'CAD・画像・動画編集', name: 'タイムラインを右へ', note: 'Shift + → (Premiere Pro などで 5 フレーム移動)', binding: () => kp('S+RIGHT') },
  { id: 'tl_left', group: 'CAD・画像・動画編集', name: 'タイムラインを左へ', note: 'Shift + ← (Premiere Pro などで 5 フレーム移動)', binding: () => kp('S+LEFT') },
  { id: 'frame_next', group: 'CAD・画像・動画編集', name: '次のフレーム', note: '→ (多くの動画編集ソフト)', binding: () => kp('RIGHT') },
  { id: 'frame_prev', group: 'CAD・画像・動画編集', name: '前のフレーム', note: '← (多くの動画編集ソフト)', binding: () => kp('LEFT') },
  { id: 'item_next', group: 'CAD・画像・動画編集', name: '次の項目', note: 'Tab', binding: () => kp('TAB') },
  { id: 'item_prev', group: 'CAD・画像・動画編集', name: '前の項目', note: 'Shift + Tab', binding: () => kp('S+TAB') },
  // ブラシサイズ: Photoshop などの ] / [ 。JIS 配列と US 配列でキーの位置 (HID コード) が違う
  { id: 'brush_up', group: 'CAD・画像・動画編集', name: 'ブラシサイズを大きく', note: '] キー (Photoshop など)', binding: (_o, h) => kp(h === 'jis' ? 'NON_US_HASH' : 'RIGHT_BRACKET') },
  { id: 'brush_dn', group: 'CAD・画像・動画編集', name: 'ブラシサイズを小さく', note: '[ キー (Photoshop など)', binding: (_o, h) => kp(h === 'jis' ? 'RIGHT_BRACKET' : 'LEFT_BRACKET') },
];

/** よく使う「時計回り / 反時計回り」の組み合わせ */
export const ENCODER_PAIRS: { name: string; cw: string; ccw: string }[] = [
  { name: '音量', cw: 'vol_up', ccw: 'vol_dn' },
  { name: '曲送り', cw: 'next', ccw: 'prev' },
  { name: '上下スクロール', cw: 'scr_dn', ccw: 'scr_up' },
  { name: '左右スクロール', cw: 'scr_r', ccw: 'scr_l' },
  { name: 'ズーム', cw: 'zoom_in', ccw: 'zoom_out' },
  { name: 'タブ切り替え', cw: 'tab_next', ccw: 'tab_prev' },
  { name: 'ページ戻る / 進む', cw: 'fwd', ccw: 'back' },
  { name: 'カーソル左右', cw: 'right', ccw: 'left' },
  { name: 'カーソル上下', cw: 'down', ccw: 'up' },
  { name: '単語移動', cw: 'word_next', ccw: 'word_prev' },
  { name: 'Page Up / Down', cw: 'pgdn', ccw: 'pgup' },
  { name: 'Undo / Redo', cw: 'redo', ccw: 'undo' },
  { name: 'フレーム送り', cw: 'frame_next', ccw: 'frame_prev' },
  { name: 'タイムライン', cw: 'tl_right', ccw: 'tl_left' },
  { name: 'ブラシサイズ', cw: 'brush_up', ccw: 'brush_dn' },
];

export const encoderAction = (id: string) => ENCODER_ACTIONS.find((a) => a.id === id);

/** エンコーダーで使えるビヘイビア (押して離すだけの動作。レイヤー操作やホールド系は不可) */
export const ENCODER_ALLOWED_BEHAVIORS = new Set(['kp', 'msc', 'mmv', 'mkp', 'bt', 'out', 'rgb_ug', 'bl', 'ext_power', 'none', 'trans']);
