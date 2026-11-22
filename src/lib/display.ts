import type { Binding, Layer, OsLayout, ShortcutDef } from '../model/types';
import { groupOs, osLayerLabel, splitLayerIndex } from '../model/os';
import { findShortcutFor } from '../model/shortcuts';
import { keycodeDescriptionJa } from '../zmk/keycodes.ja';
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
  /** OS 別キーマップの構成と、表示中のレイヤー番号 */
  os?: OsLayout;
  current?: number;
  shortcuts?: ShortcutDef[];
}

function layerName(id: number, ctx: DisplayContext): string {
  const idx = ctx.layers.findIndex((l) => l.id === id);
  if (idx < 0) return `L${id}?`;
  if (ctx.os) return osLayerLabel(ctx.os, idx, ctx.current);
  const name = ctx.layers[idx].name;
  return name === `Layer ${idx}` ? `L${idx}` : name;
}

function osSwitchDisplay(b: Binding, ctx: DisplayContext): KeyDisplay | null {
  if (b.b !== 'os_sel' && b.b !== 'os_to') return null;
  const target = b.b === 'os_sel' ? b.p[1] : b.p[0];
  const idx = ctx.layers.findIndex((l) => l.id === target);
  const osName = ctx.os && idx >= 0 ? `BT${splitLayerIndex(ctx.os, idx).os + 1} ${groupOs(ctx.os, splitLayerIndex(ctx.os, idx).os).short}` : undefined;
  const label = osName ?? layerName(target ?? 0, ctx);
  const layer = ctx.os && idx >= 0 ? `L${splitLayerIndex(ctx.os, idx).layer}` : '';
  if (b.b === 'os_sel') {
    return { main: label, hold: `BT${b.p[0]} ${layer}`.trim(), tag: 'OS', tone: 'layer', title: `OS 切替: Bluetooth プロファイル ${b.p[0]} + ${osName ?? ''} ${layer} (${layerName(target ?? 0, ctx)})` };
  }
  return { main: label, hold: layer || undefined, tag: 'OS', tone: 'layer', title: `OS 切替 (レイヤーのみ): ${osName ?? ''} ${layer}` };
}

export function describeBinding(b: Binding, ctx: DisplayContext): KeyDisplay {
  const def = ctx.behaviors.get(b.b);
  const p = b.p;
  const title = def ? `${def.nameJa}` : `&${b.b}`;
  if (b.raw !== undefined) return { main: def?.nameJa ?? b.b, hold: b.raw, tone: 'custom', title: `&${b.b} ${b.raw}` };
  const osd = osSwitchDisplay(b, ctx);
  if (osd) return osd;
  switch (b.b) {
    case 'kp': {
      const sc = modsOf(p[0] ?? 0) ? findShortcutFor(b, ctx.shortcuts, ctx.os && ctx.current !== undefined ? groupOs(ctx.os, splitLayerIndex(ctx.os, ctx.current).os).id : undefined) : undefined;
      return {
        main: keycodeLabel(p[0] ?? 0, ctx.host),
        hold: sc?.name,
        tone: isModifierKey(p[0] ?? 0) ? 'mod' : 'key',
        title: (sc ? `ショートカット「${sc.name}」\n` : '') + keyTitle(p[0] ?? 0),
      };
    }
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
    const isShortcut = /^sc_/.test(def.label) && def.definition;
    return {
      main: def.nameJa,
      hold: params.join(' ') || undefined,
      tag: isShortcut ? 'SC' : def.compatible?.startsWith('zmk,behavior-macro') ? 'MACRO' : undefined,
      tone: 'custom',
      title: isShortcut ? `ショートカット「${def.nameJa}」(複数キーの同時押し。ファームウェアのビルドが必要)` : title,
    };
  }
  return { main: b.b.startsWith('__device_') ? '?' : b.b, hold: p.join(' ') || undefined, tone: 'custom', title: `&${b.b}` };
}

function keyTitle(v: number): string {
  const k = keycodeByValue(v) ?? keycodeByValue(stripMods(v));
  return k ? `${k.names.join(' / ')}\n${keycodeDescriptionJa(k)}` : `0x${v.toString(16)}`;
}

/** エンコーダーの動作の短い表示 */
export function describeSensorAction(b: Binding, ctx: DisplayContext): string {
  if (b.b === 'trans') return '透過';
  if (b.b === 'none') return 'なし';
  const d = describeBinding(b, ctx);
  return d.hold && b.b !== 'kp' ? `${d.main} ${d.hold}` : d.hold ? `${d.main} (${d.hold})` : d.main;
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
