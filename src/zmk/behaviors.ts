/**
 * ZMK ビヘイビアの定義 (ZMK v0.2.1 の app/dts/behaviors/*.dtsi に準拠)。
 *
 * displayName は devicetree の display-name プロパティと完全に一致させています。
 * display-name を持たないもの (mkp / mmv / msc / soft_off) は Zephyr のデバイス名 (= ノード名) が使われます。
 * ZMK Studio はビヘイビアを display-name で返すため、デバイス上の ID との対応付けに使います。
 */

export type ParamKind =
  | 'keycode' // HID usage (修飾キー付き可)
  | 'modifier' // Mod-Tap のホールド側 (実体は keycode)
  | 'layer' // レイヤー ID
  | 'bt_cmd'
  | 'bt_arg'
  | 'out_cmd'
  | 'rgb_cmd'
  | 'rgb_arg'
  | 'bl_cmd'
  | 'bl_arg'
  | 'ep_cmd'
  | 'mouse_button'
  | 'mouse_move'
  | 'mouse_scroll'
  | 'number';

export type BehaviorGroup = 'key' | 'tap' | 'layer' | 'bluetooth' | 'mouse' | 'lighting' | 'special' | 'custom';

export const BEHAVIOR_GROUP_LABELS: Record<BehaviorGroup, string> = {
  key: 'キー入力',
  tap: 'タップ / ホールド',
  layer: 'レイヤー操作',
  bluetooth: 'Bluetooth・出力',
  mouse: 'マウス',
  lighting: 'ライト・電源',
  special: '特殊',
  custom: 'マクロ・カスタム',
};

export interface BehaviorDef {
  /** devicetree のラベル (&kp の "kp") */
  label: string;
  /** devicetree の display-name (ZMK Studio が返す名前) */
  displayName: string;
  /** 日本語名 */
  nameJa: string;
  description: string;
  params: ParamKind[];
  paramNames?: string[];
  group: BehaviorGroup;
  /** キーマップファイルで定義されたカスタムビヘイビア */
  custom?: boolean;
  /** devicetree のノード名・label プロパティ (Studio の表示名との照合用) */
  aliases?: string[];
  compatible?: string;
  /**
   * このアプリが用意するビヘイビア (OS 切替など) の devicetree 定義。
   * キーマップファイルに定義が無い場合、ファイル出力時に macros { } へ追加します。
   */
  definition?: string;
}

/** OS 切替 (Bluetooth プロファイル選択 + OS のデフォルトレイヤーへ移動) */
export const OS_SELECT_DEFINITION = `os_sel: os_sel {
    compatible = "zmk,behavior-macro-two-param";
    #binding-cells = <2>;
    display-name = "OS Select";
    wait-ms = <0>;
    tap-ms = <10>;
    // 1 番目のパラメータ = Bluetooth プロファイル、2 番目 = 移動先のレイヤー (&bt の 3 = BT_SEL)
    bindings = <&macro_param_1to2 &bt 3 MACRO_PLACEHOLDER &macro_param_2to1 &to MACRO_PLACEHOLDER>;
};`;

/** OS 切替 (レイヤーのみ。Bluetooth プロファイルは変えない) */
export const OS_LAYER_DEFINITION = `os_to: os_to {
    compatible = "zmk,behavior-macro-one-param";
    #binding-cells = <1>;
    display-name = "OS Layer";
    wait-ms = <0>;
    tap-ms = <10>;
    bindings = <&macro_param_1to1 &to MACRO_PLACEHOLDER>;
};`;

export const BUILTIN_BEHAVIORS: BehaviorDef[] = [
  { label: 'kp', displayName: 'Key Press', nameJa: 'キー', description: '通常のキー入力', params: ['keycode'], paramNames: ['キー'], group: 'key' },
  { label: 'mt', displayName: 'Mod-Tap', nameJa: 'Mod-Tap', description: '押し続けると修飾キー、タップでキー入力', params: ['modifier', 'keycode'], paramNames: ['ホールド (修飾キー)', 'タップ'], group: 'tap' },
  { label: 'lt', displayName: 'Layer-Tap', nameJa: 'Layer-Tap', description: '押し続けるとレイヤー切替、タップでキー入力', params: ['layer', 'keycode'], paramNames: ['ホールド (レイヤー)', 'タップ'], group: 'tap' },
  { label: 'mo', displayName: 'Momentary Layer', nameJa: '一時レイヤー', description: '押している間だけレイヤーを有効化 (MO)', params: ['layer'], paramNames: ['レイヤー'], group: 'layer' },
  { label: 'to', displayName: 'To Layer', nameJa: 'レイヤー移動', description: '指定レイヤーに切り替え (TO)', params: ['layer'], paramNames: ['レイヤー'], group: 'layer' },
  { label: 'tog', displayName: 'Toggle Layer', nameJa: 'レイヤー切替', description: '押すたびにレイヤーをオン/オフ (TOG)', params: ['layer'], paramNames: ['レイヤー'], group: 'layer' },
  { label: 'sl', displayName: 'Sticky Layer', nameJa: 'スティッキーレイヤー', description: '次の1キーだけレイヤーを有効化', params: ['layer'], paramNames: ['レイヤー'], group: 'layer' },
  { label: 'sk', displayName: 'Sticky Key', nameJa: 'スティッキーキー', description: '次の1キーだけ押された状態にする (主に修飾キー)', params: ['keycode'], paramNames: ['キー'], group: 'tap' },
  { label: 'kt', displayName: 'Key Toggle', nameJa: 'キー押しっぱなし切替', description: '押すたびにキーの押下状態を切り替え', params: ['keycode'], paramNames: ['キー'], group: 'key' },
  { label: 'trans', displayName: 'Transparent', nameJa: '透過', description: '下のレイヤーの割り当てを使用 (▽)', params: [], group: 'special' },
  { label: 'none', displayName: 'None', nameJa: 'なし', description: '何もしない', params: [], group: 'special' },
  { label: 'gresc', displayName: 'Grave/Escape', nameJa: 'Grave/Esc', description: '通常は Esc、Shift/GUI と一緒なら `', params: [], group: 'special' },
  { label: 'caps_word', displayName: 'Caps Word', nameJa: 'Caps Word', description: '次の単語だけ大文字入力', params: [], group: 'special' },
  { label: 'key_repeat', displayName: 'Key Repeat', nameJa: 'キーリピート', description: '直前のキーをもう一度送信', params: [], group: 'special' },
  { label: 'bt', displayName: 'Bluetooth', nameJa: 'Bluetooth', description: 'Bluetooth プロファイルの選択・クリア', params: ['bt_cmd', 'bt_arg'], paramNames: ['コマンド', 'プロファイル'], group: 'bluetooth' },
  { label: 'out', displayName: 'Output Selection', nameJa: '出力先切替', description: 'USB / Bluetooth の出力先を切り替え', params: ['out_cmd'], paramNames: ['出力先'], group: 'bluetooth' },
  { label: 'mkp', displayName: 'Mouse Key Press', nameJa: 'マウスボタン', description: 'マウスのクリック', params: ['mouse_button'], paramNames: ['ボタン'], group: 'mouse', aliases: ['mouse_key_press'] },
  { label: 'mmv', displayName: 'Mouse Move', nameJa: 'マウス移動', description: 'マウスカーソルを移動', params: ['mouse_move'], paramNames: ['方向'], group: 'mouse', aliases: ['mouse_move'] },
  { label: 'msc', displayName: 'Mouse Scroll', nameJa: 'スクロール', description: 'マウスホイールのスクロール', params: ['mouse_scroll'], paramNames: ['方向'], group: 'mouse', aliases: ['mouse_scroll'] },
  { label: 'rgb_ug', displayName: 'Underglow', nameJa: 'RGB アンダーグロー', description: 'RGB LED の操作', params: ['rgb_cmd', 'rgb_arg'], paramNames: ['コマンド', '値'], group: 'lighting' },
  { label: 'bl', displayName: 'Backlight', nameJa: 'バックライト', description: 'バックライトの操作', params: ['bl_cmd', 'bl_arg'], paramNames: ['コマンド', '値'], group: 'lighting' },
  { label: 'ext_power', displayName: 'External Power', nameJa: '外部電源', description: '外部電源 (VCC) のオン/オフ', params: ['ep_cmd'], paramNames: ['コマンド'], group: 'lighting' },
  { label: 'bootloader', displayName: 'Bootloader', nameJa: 'ブートローダー', description: 'ファームウェア書き込みモードに入る', params: [], group: 'special' },
  { label: 'sys_reset', displayName: 'Reset', nameJa: 'リセット', description: 'キーボードを再起動', params: [], group: 'special' },
  { label: 'soft_off', displayName: 'z_so_off', nameJa: 'ソフトオフ', description: 'キーボードの電源を切る (スリープより深い省電力状態)', params: [], group: 'special' },
  { label: 'os_sel', displayName: 'OS Select', nameJa: 'OS 切替 (BT 連動)', description: 'Bluetooth プロファイルを切り替え、その OS のデフォルトレイヤーへ移動します (このアプリが追加するマクロ &os_sel)', params: ['bt_arg', 'layer'], paramNames: ['Bluetooth プロファイル', '移動先のレイヤー'], group: 'layer', compatible: 'zmk,behavior-macro-two-param', definition: OS_SELECT_DEFINITION },
  { label: 'os_to', displayName: 'OS Layer', nameJa: 'OS 切替 (レイヤーのみ)', description: 'Bluetooth プロファイルは変えずに、その OS のデフォルトレイヤーへ移動します (このアプリが追加するマクロ &os_to)', params: ['layer'], paramNames: ['移動先のレイヤー'], group: 'layer', compatible: 'zmk,behavior-macro-one-param', definition: OS_LAYER_DEFINITION },
  { label: 'studio_unlock', displayName: 'Studio Unlock', nameJa: 'Studio アンロック', description: 'Web アプリからの編集を許可する (ZMK Studio のロック解除)', params: [], group: 'special' },
];

/** ビヘイビアの compatible から推定するパラメータ種別 (カスタムビヘイビア用) */
export function paramsForCompatible(compatible: string, cells: number, childParams?: ParamKind[][]): ParamKind[] {
  if (compatible === 'zmk,behavior-hold-tap' && cells === 2 && childParams) {
    return [childParams[0]?.[0] ?? 'number', childParams[1]?.[0] ?? 'keycode'];
  }
  if (compatible === 'zmk,behavior-macro-one-param' && cells === 1) return ['keycode'];
  if (compatible === 'zmk,behavior-macro-two-param' && cells === 2) return ['number', 'number'];
  if (compatible === 'zmk,behavior-sticky-key' && cells === 1) return ['keycode'];
  if (compatible === 'zmk,behavior-tap-dance') return [];
  if (compatible === 'zmk,behavior-mod-morph') return [];
  return Array.from({ length: cells }, () => 'number' as ParamKind);
}

// ---------------------------------------------------------------------------
// パラメータの名前付き定数 (ZMK の dt-bindings ヘッダと同じ値)
// ---------------------------------------------------------------------------

export interface NamedValue {
  value: number;
  name: string; // キーマップでの表記
  label: string; // 画面表示
  /** 2番目のパラメータを必要とするか */
  needsArg?: boolean;
}

export const BT_COMMANDS: NamedValue[] = [
  { value: 3, name: 'BT_SEL', label: 'プロファイル選択', needsArg: true },
  { value: 1, name: 'BT_NXT', label: '次のプロファイル' },
  { value: 2, name: 'BT_PRV', label: '前のプロファイル' },
  { value: 0, name: 'BT_CLR', label: '現在のペアリング解除' },
  { value: 4, name: 'BT_CLR_ALL', label: '全ペアリング解除' },
  { value: 5, name: 'BT_DISC', label: 'プロファイル切断', needsArg: true },
];

export const OUT_COMMANDS: NamedValue[] = [
  { value: 0, name: 'OUT_TOG', label: 'USB / BLE 切替' },
  { value: 1, name: 'OUT_USB', label: 'USB 優先' },
  { value: 2, name: 'OUT_BLE', label: 'Bluetooth 優先' },
];

export const RGB_COMMANDS: NamedValue[] = [
  { value: 0, name: 'RGB_TOG', label: 'オン/オフ' },
  { value: 1, name: 'RGB_ON', label: 'オン' },
  { value: 2, name: 'RGB_OFF', label: 'オフ' },
  { value: 3, name: 'RGB_HUI', label: '色相 +' },
  { value: 4, name: 'RGB_HUD', label: '色相 -' },
  { value: 5, name: 'RGB_SAI', label: '彩度 +' },
  { value: 6, name: 'RGB_SAD', label: '彩度 -' },
  { value: 7, name: 'RGB_BRI', label: '明るさ +' },
  { value: 8, name: 'RGB_BRD', label: '明るさ -' },
  { value: 9, name: 'RGB_SPI', label: '速度 +' },
  { value: 10, name: 'RGB_SPD', label: '速度 -' },
  { value: 11, name: 'RGB_EFF', label: '次のエフェクト' },
  { value: 12, name: 'RGB_EFR', label: '前のエフェクト' },
];

export const BL_COMMANDS: NamedValue[] = [
  { value: 0, name: 'BL_ON', label: 'オン' },
  { value: 1, name: 'BL_OFF', label: 'オフ' },
  { value: 2, name: 'BL_TOG', label: 'オン/オフ' },
  { value: 3, name: 'BL_INC', label: '明るさ +' },
  { value: 4, name: 'BL_DEC', label: '明るさ -' },
  { value: 5, name: 'BL_CYCLE', label: '明るさ循環' },
  { value: 6, name: 'BL_SET', label: '明るさ指定', needsArg: true },
];

export const EP_COMMANDS: NamedValue[] = [
  { value: 1, name: 'EP_ON', label: 'オン' },
  { value: 0, name: 'EP_OFF', label: 'オフ' },
  { value: 2, name: 'EP_TOG', label: 'オン/オフ' },
];

export const MOUSE_BUTTONS: NamedValue[] = [
  { value: 1, name: 'LCLK', label: '左クリック' },
  { value: 2, name: 'RCLK', label: '右クリック' },
  { value: 4, name: 'MCLK', label: '中クリック' },
  { value: 8, name: 'MB4', label: '戻る (ボタン4)' },
  { value: 16, name: 'MB5', label: '進む (ボタン5)' },
];

const moveY = (v: number) => (v & 0xffff) >>> 0;
const moveX = (v: number) => ((v & 0xffff) << 16) >>> 0;

export const MOUSE_MOVES: NamedValue[] = [
  { value: moveY(-600), name: 'MOVE_UP', label: '上へ移動' },
  { value: moveY(600), name: 'MOVE_DOWN', label: '下へ移動' },
  { value: moveX(-600), name: 'MOVE_LEFT', label: '左へ移動' },
  { value: moveX(600), name: 'MOVE_RIGHT', label: '右へ移動' },
];

/** スクロール量 (ZMK 既定値 10。キーマップで ZMK_POINTING_DEFAULT_SCRL_VAL を上書きしている場合は値が変わる) */
export function mouseScrolls(scrollVal = 10): NamedValue[] {
  return [
    { value: moveY(scrollVal), name: 'SCRL_UP', label: '上スクロール' },
    { value: moveY(-scrollVal), name: 'SCRL_DOWN', label: '下スクロール' },
    { value: moveX(-scrollVal), name: 'SCRL_LEFT', label: '左スクロール' },
    { value: moveX(scrollVal), name: 'SCRL_RIGHT', label: '右スクロール' },
  ];
}
