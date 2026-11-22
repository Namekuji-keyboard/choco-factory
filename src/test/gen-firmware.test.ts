import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { chocoKey } from '../keyboards/choco-key';
import { exportKeymap, layersFromParsed, parseKeymap } from '../zmk/keymap';
import { osLayersFromKeymap } from '../model/project';
import { OS_LIST, absLayer, defaultOsLayout, osSelectBinding } from '../model/os';
import { padRuntimeLayers } from '../model/runtime';

/**
 * firmware/choco-key/studio/config/Choco-Key.keymap (OS 別 25 レイヤー + 即時編集用の仮想キー) を生成する。
 * 元にするのは 5 レイヤー版 (Studio 対応・予備レイヤー付き) のキーマップ。
 *   GEN_FW=<5 レイヤー版のパス> npx vitest run src/test/gen-firmware.test.ts
 */
it.skipIf(!process.env.GEN_FW)('generate firmware keymap', () => {
  const rt = chocoKey.runtime!;
  let src = readFileSync(process.env.GEN_FW!, 'utf8');
  // 予備レイヤー (status = "reserved") は不要になるので削除
  src = src.replace(/\n\s*\/\/ ZMK Studio から追加できる予備レイヤー[^\n]*\n(\s*layer_\d+ \{ status = "reserved"; \};\n)+/, '\n');
  const os = defaultOsLayout();
  // 物理キーのレイヤー (エンコーダーの割り当ては sensors として読み込まれる)
  const layers42 = osLayersFromKeymap(chocoKey, src, layersFromParsed(parseKeymap(src)));
  // 各 OS の Layer 4 の右手 2 段目 (キー 16〜20) に OS 切替キー (BT プロファイル連動) を置く
  OS_LIST.forEach((_, o) => {
    const l4 = layers42[absLayer(os, o, 4)];
    OS_LIST.forEach((__, target) => {
      const pos = 15 + target;
      if (l4.bindings[pos].b !== 'trans') throw new Error(`position ${pos} is not &trans`);
      l4.bindings[pos] = osSelectBinding(os, target, true);
    });
  });
  const layers = padRuntimeLayers(layers42, chocoKey);

  // 即時編集用のビヘイビアを追加し、エンコーダーを仮想キー経由にする
  const macroNodes = Array.from({ length: rt.macroSlots }, (_, m) => {
    const steps = Array.from({ length: rt.macroSteps }, (_, s) => `&vkey ${rt.macroBase + m * rt.macroSteps + s}`).join(' ');
    return `        rtm${m}: rtm${m} {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            display-name = "RT Macro ${m + 1}";
            wait-ms = <10>;
            tap-ms = <10>;
            bindings = <${steps}>;
        };`;
  }).join('\n\n');
  src = src.replace(
    /(\n    macros \{\n)/,
    `$1        // ---- Choco Factory 即時編集マクロ: 中身 (仮想キー ${rt.macroBase}〜${rt.comboConfigBase - 1}) は ZMK Studio で変更 ----\n${macroNodes}\n\n`,
  );
  src = src.replace(
    /(\n    behaviors \{\n)/,
    `$1        // ---- Choco Factory 即時編集 (firmware/choco-key/studio/src) ----
        vkey: vkey {
            compatible = "zmk,behavior-choco-vkey";
            #binding-cells = <1>;
            display-name = "Virtual Key";
        };

        rt_combo: rt_combo {
            compatible = "zmk,behavior-choco-runtime-combos";
            #binding-cells = <2>;
            display-name = "Runtime Combo";
            config-first-position = <${rt.comboConfigBase}>;
            output-first-position = <${rt.comboOutputBase}>;
            slots = <${rt.comboSlots}>;
            physical-keys = <${chocoKey.keys.length}>;
            layers-per-group = <${rt.layersPerGroup}>;
        };

        // エンコーダー: 回すと仮想キー (右 ${rt.encoderBase}/${rt.encoderBase + 1}・左 ${rt.encoderBase + 2}/${rt.encoderBase + 3}) の割り当てを押す
        enc_vk: enc_vk {
            compatible = "zmk,behavior-sensor-rotate-var";
            #sensor-binding-cells = <2>;
            bindings = <&vkey>, <&vkey>;
            tap-ms = <20>;
        };

`,
  );
  src = src.replace(/sensor-bindings = <&scroll_up_down>, <&scroll_left_right>;/g, `sensor-bindings = <&enc_vk ${rt.encoderBase} ${rt.encoderBase + 1}>, <&enc_vk ${rt.encoderBase + 2} ${rt.encoderBase + 3}>;`);

  const { text, warnings } = exportKeymap(src, layers, chocoKey, [], { osMacros: true });
  if (warnings.length) throw new Error(warnings.join('\n'));
  const header = `/*
 * Choco-Key キーマップ (OS 別 25 レイヤー + 即時編集 / Choco Factory で生成)
 *
 * レイヤー番号 = Bluetooth プロファイル × 5 + レイヤー番号 (プロファイルごとに OS を選べます)
 *   BT 0: 0〜4 / BT 1: 5〜9 / BT 2: 10〜14 / BT 3: 15〜19 / BT 4: 20〜24
 * 各グループの Layer 4 の右手 2 段目に OS 切替キー (&os_sel <BT プロファイル> <レイヤー>) があります。
 * 電源投入時はレイヤー 0 から始まります (ZMK はアクティブなレイヤーを保存しないため)。
 *
 * 各レイヤーのキー 1〜42 は物理キー、43〜126 は物理キーの無い仮想キーです (ZMK Studio で即時に変更できます)。
 *   43〜46: エンコーダー (右 時計回り / 右 反時計回り / 左 時計回り / 左 反時計回り)。レイヤーごとに設定可
 *   47〜94: マクロ &rtm0〜&rtm5 の中身 (8 ステップずつ)。レイヤー 0 で設定し、他のレイヤーは &trans
 *   95〜110: コンボの設定 (&rt_combo)、111〜126: コンボの動作。レイヤー 0 で設定し、他のレイヤーは &trans
 */

`;
  writeFileSync(process.env.OUT_FILE ?? 'firmware/choco-key/studio/config/Choco-Key.keymap', header + text);
});
