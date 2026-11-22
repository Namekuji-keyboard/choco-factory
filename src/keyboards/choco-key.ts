import type { KeyboardDefinition, KeyLayout } from '../model/types';

/**
 * Choco-Key (左右分割・XIAO nRF52840・ZMK v0.2.1)
 *
 * キー配置は zmk-config の config/Choco-Key.json および基板 (Choco_Key.kicad_pcb) の
 * 19mm 格子配置から作成。並び順はキーマップの bindings / matrix transform と同じ。
 */

const files = import.meta.glob('../../firmware/choco-key/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const dotfiles = import.meta.glob('../../firmware/choco-key/**/.github/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function collect(kind: 'original' | 'studio'): Record<string, string> {
  const prefix = `../../firmware/choco-key/${kind}/`;
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries({ ...files, ...dotfiles })) {
    if (path.startsWith(prefix)) out[path.slice(prefix.length)] = content;
  }
  return out;
}

const keys: KeyLayout[] = [];
for (let row = 0; row < 3; row++) {
  for (let c = 0; c < 5; c++) keys.push({ x: c, y: row, w: 1, h: 1, side: 'L', row, col: c });
  for (let c = 8; c < 13; c++) keys.push({ x: c, y: row, w: 1, h: 1, side: 'R', row, col: c });
}
for (let c = 0; c < 6; c++) keys.push({ x: c, y: 3, w: 1, h: 1, side: 'L', row: 3, col: c });
for (let c = 7; c < 13; c++) keys.push({ x: c, y: 3, w: 1, h: 1, side: 'R', row: 3, col: c });

const original = collect('original');
const studioOverrides = collect('studio');
/** ZMK Studio を無効にした構成: 即時編集用の仮想キーやモジュールは同じで、build.yaml だけ元のまま */
const noStudio = { ...original, ...studioOverrides, 'build.yaml': original['build.yaml'] };

export const chocoKey: KeyboardDefinition = {
  id: 'choco-key',
  name: 'Choco-Key',
  description: '左右分割 42 キー / ロータリーエンコーダー × 2 / Bluetooth',
  deviceNames: ['Choco-Key', 'Choco-Key_R'],
  controller: 'Seeed Studio XIAO nRF52840',
  zmkVersion: 'v0.2.1',
  central: 'R',
  keys,
  // エンコーダー (EC12E) は基板上で親指クラスタ内側のキーの上にある。表示はキーと重ならない位置に置く。
  // sensors = <&right_encoder &left_encoder> なので sensor-bindings の 0 番目が右、1 番目が左
  encoders: [
    { sensorIndex: 1, side: 'L', x: 5.5, y: 2.5, name: '左エンコーダー' },
    { sensorIndex: 0, side: 'R', x: 7.5, y: 2.5, name: '右エンコーダー' },
  ],
  // 物理キー 4 行 + 仮想キー (エンコーダー 4 / マクロ 6×8 / コンボ設定 16 / コンボ出力 16)
  rowSizes: [10, 10, 10, 12, 4, 8, 8, 8, 8, 8, 8, 16, 16],
  leftCounts: [5, 5, 5, 6, 4, 8, 8, 8, 8, 8, 8, 16, 16],
  unlockHint: '右手の最下段右端 (&lt 4 ESC) を押したまま、右手の最上段左端のキー (Layer 4 の &studio_unlock) を押してください。',
  files: { original: noStudio, studio: { ...original, ...studioOverrides }, pristine: original },
  keymapPath: 'config/Choco-Key.keymap',
  runtime: {
    encoderBase: 42,
    macroBase: 46,
    macroSlots: 6,
    macroSteps: 8,
    comboConfigBase: 94,
    comboOutputBase: 110,
    comboSlots: 16,
    layersPerGroup: 5,
    total: 126,
    comboBehavior: 'rt_combo',
    macroBehaviorPrefix: 'rtm',
  },
};
