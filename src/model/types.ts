/** キー1つ分の割り当て */
export interface Binding {
  /** ビヘイビアの devicetree ラベル (例: "kp", "mt", "lt", "trans") */
  b: string;
  /** 数値パラメータ (ZMK の 32bit セル値)。レイヤー指定はレイヤー ID */
  p: number[];
  /** 数値に評価できなかったパラメータの元の表記 (エクスポート時にそのまま出力) */
  raw?: string;
}

/** ロータリーエンコーダー 1 個分の割り当て (時計回り / 反時計回り) */
export interface SensorBinding {
  cw: Binding;
  ccw: Binding;
}

export interface Layer {
  /** レイヤー ID (ZMK のレイヤー ID。キーマップファイル上では定義順の番号) */
  id: number;
  name: string;
  bindings: Binding[];
  /**
   * エンコーダーの割り当て (sensor-bindings。添字 = センサー番号)。
   * ZMK Studio では編集できないため、ファイル出力 → ファームウェアのビルドで反映します。
   * undefined = キーマップファイルの記述をそのまま使う
   */
  sensors?: SensorBinding[];
}

export type OsId = 'windows' | 'macos' | 'linux' | 'ios' | 'android';

export interface OsSettings {
  id: OsId;
  /** OS 内のレイヤー番号 (0 〜 layersPerOs-1)。OS 切替キーで最初に有効になるレイヤー */
  defaultLayer: number;
}

/**
 * OS 別キーマップの構成。
 * project.layers は「OS の順 × OS 内レイヤー」の順で並ぶ (OS i のレイヤー j = layers[i * layersPerOs + j])。
 * ZMK のレイヤー番号もこの並びと同じです。
 */
export interface OsLayout {
  layersPerOs: number;
  systems: OsSettings[];
}

/** ショートカット (複数キーの同時押し) */
export interface ShortcutDef {
  id: string;
  name: string;
  /** 対象 OS ('all' = 共通) */
  os: OsId | 'all';
  /** 押す順のキーコード (修飾キーを含む) */
  keys: number[];
  note?: string;
}

/** コンボ (複数キーの同時押しで別の動作) */
export interface ComboDef {
  id: string;
  name: string;
  /** キー位置 (0 始まり) */
  positions: number[];
  binding: Binding;
  /** 有効なレイヤー ID (空 = すべてのレイヤー) */
  layers: number[];
  timeoutMs: number;
}

/** 物理キー配置 (単位: キー 1u) */
export interface KeyLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  rx?: number;
  ry?: number;
  side?: 'L' | 'R';
  /** 行・列 (表示・整形用) */
  row?: number;
  col?: number;
}

export interface EncoderLayout {
  /** sensor-bindings のインデックス */
  sensorIndex: number;
  side: 'L' | 'R';
  x: number;
  y: number;
  name: string;
}

export interface KeyboardDefinition {
  id: string;
  name: string;
  description?: string;
  /** ZMK Studio が返すデバイス名 (CONFIG_ZMK_KEYBOARD_NAME) */
  deviceNames: string[];
  controller: string;
  zmkVersion: string;
  /** ZMK Studio を有効にする側 (= スプリットのセントラル) */
  central?: 'L' | 'R';
  keys: KeyLayout[];
  encoders?: EncoderLayout[];
  /** キーマップを整形出力するときの行区切り (各行のキー数) */
  rowSizes: number[];
  /** 左右の分割位置 (各行で左手のキー数) */
  leftCounts: number[];
  /** studio_unlock の場所の説明 */
  unlockHint?: string;
  /** ZIP 出力に含めるファイル (zmk-config 内の相対パス → 内容) */
  files: { original: Record<string, string>; studio: Record<string, string> };
  keymapPath: string;
}

/** マクロ (ファイル出力専用。ZMK Studio はマクロの作成に未対応) */
export interface MacroDef {
  /** devicetree ラベル (英数字と _) */
  label: string;
  name: string;
  /** タップするキーコード列 */
  keys: number[];
  waitMs: number;
  tapMs: number;
}

export interface Project {
  id: string;
  name: string;
  keyboardId: string;
  layers: Layer[];
  /** エクスポートのベースになるキーマップファイル (インポートしたもの、または既定のもの) */
  keymapSource: string;
  /** プロジェクトで新規作成したマクロ */
  macros: MacroDef[];
  createdAt: number;
  updatedAt: number;
  /** データ形式のバージョン (2 = OS 別キーマップ) */
  schema?: number;
  /** OS 別キーマップの構成 */
  os?: OsLayout;
  shortcuts?: ShortcutDef[];
  combos?: ComboDef[];
  /** 旧形式から移行したときに OS 別の構成に入りきらなかったレイヤー (失わないよう保存) */
  legacyLayers?: Layer[];
  /** 最後に同期したデバイス */
  device?: { name: string; serial?: string; syncedAt?: number };
}
