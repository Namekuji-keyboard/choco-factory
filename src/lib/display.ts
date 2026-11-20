import type { Binding, Layer } from '../model/types';
import { BL_COMMANDS, BT_COMMANDS, EP_COMMANDS, MOUSE_BUTTONS, MOUSE_MOVES, OUT_COMMANDS, RGB_COMMANDS, mouseScrolls, type BehaviorDef } from '../zmk/behaviors';
import { keycodeByValue, keycodeLabel, modsOf, MOD_FUNCS, stripMods, type HostLayout } from '../zmk/keycodes';

export type Tone = 'key' | 'mod' | 'tap' | 'layer' | 'trans' | 'none' | 'bt' | 'special' | 'custom' | 'mouse';

export interface KeyDisplay {
  /** 中央の大きい表示 */
  main: string;
  /** 下段の小さい表示 (ホールド時の動作など) */
  hold?: string;
  /** 左上のタグ (MT, LT, MO…) */
  tag?: string;
  tone: Tone;
  /** ツールチップ */
  title: string;
}

const isModifierKey = (v: number) => {
  const k = keycodeByValue(stripMods(v));
  return !!k && k.category === 'modifiers' && modsOf(v) === 0;
};

function modLabel(v: number, host: HostLayout): string {
  // Mod-Tap のホールド側は修飾キーなので短く表示
  const k = keycodeByValue(stripMods(v));
  if (k?.category === 'modifiers' && modsOf(v) === 0) return keycodeLabel(v, host);
  const mods = modsOf(v);
  if (mods && !k) return MOD_FUNCS.filter((m) => mods & m.bit).map((m) => m.short).join('+');
  return keycodeLabel(v, host);
}

export interface DisplayContext {
  behaviors: Map<string, BehaviorDef>;
  layers: Layer[];
  host: HostLayout;
  scrollVal: number;
}

function layerName(id: number, ctx: DisplayContext): string {
  const idx = ctx.layers.findIndex((l) => l.id === id);
  if (idx < 0) return `L${id}?`;
  const name = ctx.layers[idx].name;
  return name === `Layer ${idx}` ? `L${idx}` : name;
}

export function describeBinding(b: Binding, ctx: DisplayContext): KeyDisplay {
  const def = ctx.behaviors.get(b.b);
  const p = b.p;
  const title = def ? `${def.nameJa}` : `&${b.b}`;
  if (b.raw !== undefined) return { main: def?.nameJa ?? b.b, hold: b.raw, tone: 'custom', title: `&${b.b} ${b.raw}` };
  switch (b.b) {
    case 'kp':
      return { main: keycodeLabel(p[0] ?? 0, ctx.host), tone: isModifierKey(p[0] ?? 0) ? 'mod' : 'key', title: keyTitle(p[0] ?? 0) };
    case 'mt':
      return { main: keycodeLabel(p[1] ?? 0, ctx.host), hold: modLabel(p[0] ?? 0, ctx.host), tag: 'MT', tone: 'tap', title: `Mod-Tap: タップ ${keycodeLabel(p[1] ?? 0, ctx.host)} / ホールド ${modLabel(p[0] ?? 0, ctx.host)}` };
    case 'lt':
      return { main: keycodeLabel(p[1] ?? 0, ctx.host), hold: layerName(p[0] ?? 0, ctx), tag: 'LT', tone: 'tap', title: `Layer-Tap: タップ ${keycodeLabel(p[1] ?? 0, ctx.host)} / ホールド ${layerName(p[0] ?? 0, ctx)}` };
    case 'mo':
      return { main: layerName(p[0] ?? 0, ctx), tag: 'MO', tone: 'layer', title: `押している間 ${layerName(p[0] ?? 0, ctx)}` };
    case 'to':
      return { main: layerName(p[0] ?? 0, ctx), tag: 'TO', tone: 'layer', title: `${layerName(p[0] ?? 0, ctx)} に切り替え` };
    case 'tog':
      return { main: layerName(p[0] ?? 0, ctx), tag: 'TG', tone: 'layer', title: `${layerName(p[0] ?? 0, ctx)} をオン/オフ` };
    case 'sl':
      return { main: layerName(p[0] ?? 0, ctx), tag: 'SL', tone: 'layer', title: `次の1キーだけ ${layerName(p[0] ?? 0, ctx)}` };
    case 'sk':
      return { main: keycodeLabel(p[0] ?? 0, ctx.host), tag: 'SK', tone: 'mod', title: `スティッキーキー ${keycodeLabel(p[0] ?? 0, ctx.host)}` };
    case 'kt':
      return { main: keycodeLabel(p[0] ?? 0, ctx.host), tag: 'KT', tone: 'key', title: `キー押しっぱなし切替 ${keycodeLabel(p[0] ?? 0, ctx.host)}` };
    case 'trans':
      return { main: '▽', tone: 'trans', title: '透過 (下のレイヤーの割り当てを使用)' };
    case 'none':
      return { main: '—', tone: 'none', title: 'なし (何もしない)' };
    case 'bt': {
      const cmd = BT_COMMANDS.find((c) => c.value === p[0]);
      if (cmd?.value === 3) return { main: `BT ${p[1]}`, hold: 'プロファイル', tag: 'BT', tone: 'bt', title: `Bluetooth プロファイル ${p[1]} を選択` };
      if (cmd?.value === 5) return { main: `BT ${p[1]}`, hold: '切断', tag: 'BT', tone: 'bt', title: `Bluetooth プロファイル ${p[1]} を切断` };
      return { main: cmd?.label ?? 'BT', tag: 'BT', tone: 'bt', title: `Bluetooth: ${cmd?.label ?? p.join(' ')}` };
    }
    case 'out':
      return { main: OUT_COMMANDS.find((c) => c.value === p[0])?.label ?? 'OUT', tag: 'OUT', tone: 'bt', title: '出力先切替' };
    case 'mkp':
      return { main: MOUSE_BUTTONS.find((c) => c.value === p[0])?.label ?? `ボタン ${p[0]}`, tag: 'MOUSE', tone: 'mouse', title: 'マウスボタン' };
    case 'mmv':
      return { main: MOUSE_MOVES.find((c) => c.value === p[0] >>> 0)?.label ?? '移動', tag: 'MOUSE', tone: 'mouse', title: 'マウス移動' };
    case 'msc':
      return { main: mouseScrolls(ctx.scrollVal).find((c) => c.value === p[0] >>> 0)?.label ?? 'スクロール', tag: 'MOUSE', tone: 'mouse', title: 'スクロール' };
    case 'rgb_ug':
      return { main: RGB_COMMANDS.find((c) => c.value === p[0])?.label ?? 'RGB', tag: 'RGB', tone: 'special', title: 'RGB アンダーグロー' };
    case 'bl':
      return { main: BL_COMMANDS.find((c) => c.value === p[0])?.label ?? 'BL', tag: 'BL', tone: 'special', title: 'バックライト' };
    case 'ext_power':
      return { main: EP_COMMANDS.find((c) => c.value === p[0])?.label ?? 'EP', tag: 'PWR', tone: 'special', title: '外部電源' };
    case 'bootloader':
      return { main: 'Boot', tag: 'SYS', tone: 'special', title: 'ブートローダー (書き込みモード)' };
    case 'sys_reset':
      return { main: 'Reset', tag: 'SYS', tone: 'special', title: '再起動' };
    case 'studio_unlock':
      return { main: 'Unlock', tag: 'STUDIO', tone: 'special', title: 'Studio アンロック' };
    case 'caps_word':
      return { main: 'CapsWord', tone: 'special', title: 'Caps Word' };
    case 'key_repeat':
      return { main: 'Repeat', tone: 'special', title: 'キーリピート' };
    case 'gresc':
      return { main: 'Esc/`', tone: 'special', title: 'Grave/Escape' };
    case 'soft_off':
      return { main: 'Off', tag: 'SYS', tone: 'special', title: 'ソフトオフ' };
  }
  if (def) {
    const params = def.params.map((k, i) => (k === 'keycode' || k === 'modifier' ? keycodeLabel(p[i] ?? 0, ctx.host) : k === 'layer' ? layerName(p[i] ?? 0, ctx) : String(p[i] ?? '')));
    if (def.compatible === 'zmk,behavior-hold-tap' && params.length === 2) {
      return { main: params[1], hold: params[0], tag: 'HT', tone: 'tap', title: `${def.nameJa}: タップ ${params[1]} / ホールド ${params[0]}` };
    }
    return { main: def.nameJa, hold: params.join(' ') || undefined, tag: def.compatible?.startsWith('zmk,behavior-macro') ? 'MACRO' : undefined, tone: 'custom', title };
  }
  return { main: b.b.startsWith('__device_') ? '?' : b.b, hold: p.join(' ') || undefined, tone: 'custom', title: `&${b.b}` };
}

function keyTitle(v: number): string {
  const k = keycodeByValue(v) ?? keycodeByValue(stripMods(v));
  return k ? `${k.names.join(' / ')}\n${k.comment}` : `0x${v.toString(16)}`;
}

export const TONE_CLASSES: Record<Tone, string> = {
  key: 'text-fg',
  mod: 'text-sky-700 dark:text-sky-300',
  tap: 'text-fg',
  layer: 'text-violet-700 dark:text-violet-300',
  trans: 'text-muted/60',
  none: 'text-muted/60',
  bt: 'text-blue-700 dark:text-blue-300',
  special: 'text-rose-700 dark:text-rose-300',
  custom: 'text-emerald-700 dark:text-emerald-300',
  mouse: 'text-amber-700 dark:text-amber-300',
};
