/**
 * ZMK v0.2.1 では、マウス系のビヘイビア (&msc スクロール / &mmv 移動 / &mkp クリック) と &ext_power に
 * ZMK Studio 用のパラメータ情報 (metadata) が無いため、ZMK Studio から書き込むと必ず
 * 「パラメータが不正です (INVALID_PARAMETERS)」になる (app/src/behavior.c の zmk_behavior_validate_binding)。
 *
 * そこでファームウェアに「パラメータ無しのマクロ」(&cf_scrl_up など: 押している間 &msc SCRL_UP を押し続ける) を用意し、
 * キーボードとやり取りするときだけ、アプリの &msc SCRL_UP ⇔ &cf_scrl_up を自動で変換する。
 * アプリ内・ファイル出力では通常の &msc / &mmv / &mkp のまま扱う。
 */
import type { Binding } from '../model/types';
import { MOUSE_BUTTONS, MOUSE_MOVES, mouseScrolls, type BehaviorDef } from '../zmk/behaviors';

export interface DeviceWrapper {
  label: string;
  native: Binding;
  /** ファームウェアのキーマップでの定義に使う ZMK の表記 */
  zmk: string;
  name: string;
}

export const ZMK_STUDIO_UNSUPPORTED = new Set(['msc', 'mmv', 'mkp', 'ext_power']);

export function deviceWrappers(scrollVal: number): DeviceWrapper[] {
  const sc = mouseScrolls(scrollVal);
  const scrollIds = ['cf_scrl_up', 'cf_scrl_dn', 'cf_scrl_lt', 'cf_scrl_rt'];
  const moveIds = ['cf_move_up', 'cf_move_dn', 'cf_move_lt', 'cf_move_rt'];
  const clickIds = ['cf_lclk', 'cf_rclk', 'cf_mclk', 'cf_mb4', 'cf_mb5'];
  return [
    ...sc.map((c, i) => ({ label: scrollIds[i], native: { b: 'msc', p: [c.value] }, zmk: `&msc ${c.name}`, name: c.label })),
    ...MOUSE_MOVES.map((c, i) => ({ label: moveIds[i], native: { b: 'mmv', p: [c.value] }, zmk: `&mmv ${c.name}`, name: c.label })),
    ...MOUSE_BUTTONS.map((c, i) => ({ label: clickIds[i], native: { b: 'mkp', p: [c.value] }, zmk: `&mkp ${c.name}`, name: c.label })),
  ];
}

/** ファームウェアのキーマップに追加するマクロの定義 */
export function wrapperDefinitions(scrollVal: number): string {
  return deviceWrappers(scrollVal)
    .map(
      (w) => `${w.label}: ${w.label} {
    compatible = "zmk,behavior-macro";
    #binding-cells = <0>;
    display-name = "${w.label}";
    wait-ms = <0>;
    tap-ms = <0>;
    // ${w.name}: 押している間 ${w.zmk} を押し続ける (ZMK Studio から書き込めるようにするため)
    bindings = <&macro_press ${w.zmk}>, <&macro_pause_for_release>, <&macro_release ${w.zmk}>;
};`,
    )
    .join('\n\n');
}

const same = (a: Binding, b: Binding) => a.b === b.b && a.p.length === b.p.length && a.p.every((v, i) => v >>> 0 === b.p[i] >>> 0);

export const toDeviceBinding = (b: Binding, wrappers: DeviceWrapper[]): Binding => {
  const w = wrappers.find((x) => same(x.native, b));
  return w ? { b: w.label, p: [] } : b;
};

export const fromDeviceBinding = (b: Binding, wrappers: DeviceWrapper[]): Binding => {
  const w = wrappers.find((x) => x.label === b.b);
  return w ? { ...w.native, p: [...w.native.p] } : b;
};

/**
 * 代わりのマクロのビヘイビア定義。
 * プロジェクトの元にしたキーマップが古く、マクロの定義を含まない場合でも、
 *  - キーボードとの対応付け (表示名 cf_scrl_up など) ができるように
 *  - ZIP / .keymap 出力に定義を自動で追加できるように
 * キーマップとは別に常に用意する。
 */
export function wrapperBehaviors(scrollVal: number): BehaviorDef[] {
  const defs = wrapperDefinitions(scrollVal).split('\n\n');
  return deviceWrappers(scrollVal).map((w, i) => ({
    label: w.label,
    displayName: w.label,
    nameJa: w.name,
    description: `${w.name} (ZMK Studio から書き込むための ${w.zmk} の代わりのマクロ)`,
    params: [],
    group: 'mouse' as const,
    custom: true,
    compatible: 'zmk,behavior-macro',
    definition: defs[i],
  }));
}
