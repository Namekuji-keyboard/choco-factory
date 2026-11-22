# firmware/ — Choco-Key の ZMK 設定

| フォルダ | 内容 |
| --- | --- |
| `choco-key/original/` | Choco-Key-Factory リポジトリの zmk-config をそのままコピーしたもの (変更なし) |
| `choco-key/studio/` | ZMK Studio 対応にするために **変更したファイルだけ** を置いたもの |
| `choco-key/studio.patch` | `original` → `studio` の差分 (`diff -ru`) |

アプリはこの 2 つを読み込み、ZIP 出力時に「元の構成」/「ZMK Studio 対応版」として zmk-config 一式を出力します。

## ZMK Studio 対応・即時編集のための変更

ZMK v0.2.1 の公式ドキュメント (docs/features/studio.md, docs/development/hardware-integration/physical-layouts.md) に従っています。

1. **`build.yaml`** — セントラルである **右手 (`Choco-Key_R`) のビルドだけ** に以下を追加。左手と `settings_reset` は変更なし。
   ```yaml
   snippet: studio-rpc-usb-uart
   cmake-args: -DCONFIG_ZMK_STUDIO=y
   ```
   - Choco-Key は `Kconfig.defconfig` で `Choco-Key_R` に `ZMK_SPLIT_ROLE_CENTRAL` が設定されているため、右手がセントラル (キーマップを持つ側・PC と通信する側) です。
2. **`Choco-Key.dtsi`** — ZMK Studio は `keys` 付きの物理レイアウトが必須で、`chosen` の `zmk,matrix-transform` があってはならないため:
   - `#include <physical_layouts.dtsi>` を追加
   - `chosen` の `zmk,matrix_transform = &default_transform;` を `zmk,physical-layout = &default_layout;` に置き換え
   - `default_layout` (42 キー、`transform = <&default_transform>`) を追加
   - matrix transform 本体・kscan・エンコーダー設定は変更なし (右手 overlay の `col-offset` もそのまま有効)
3. **`Choco-Key.keymap`** — OS 別 25 レイヤー版 (アプリの `src/test/gen-firmware.test.ts` で生成)
   - 元の 5 レイヤーを 5 つの OS にコピーして 25 レイヤーに (Windows 0〜4 / macOS 5〜9 / Linux 10〜14 / iOS 15〜19 / Android 20〜24)。各 OS のレイヤー操作 (`&lt` など) はその OS 内のレイヤーを指すように付け替え
   - 各 OS の Layer 4 の右手最上段左端 (これまで `&trans`) を `&studio_unlock` に変更 (Web からの編集を許可するためのキー)
   - 各 OS の Layer 4 の右手 2 段目 (これまで `&trans`) に OS 切替キー `&os_sel <BT プロファイル> <レイヤー>` を配置 (Win / Mac / Linux / iOS / Android)
   - マクロ `os_sel` (`zmk,behavior-macro-two-param`: `&bt BT_SEL` → `&to`) と `os_to` (`&to` のみ) を追加。ZMK Studio からパラメータを書き換えられるので、OS のデフォルトレイヤーの変更はファームウェアの再ビルド不要
   - 予備レイヤー (`status = "reserved"`) は使わない (25 レイヤーを固定で定義)
4. **`Choco-Key.zmk.yml`** — `features` に `studio` を追加 (メタデータのみ)

### 変更していないもの

- 左右間の BLE 接続設定、BLE / バッテリー関連の Kconfig、`rgbled_adapter`、エンコーダー、`west.yml` (ZMK v0.2.1)、GitHub Actions のワークフロー
- 既存のキー割り当て (各 OS の Layer 4 で、`&trans` だった 6 キーに Studio アンロック・OS 切替キーを置いた以外)

### 補足

- `&studio_unlock` は名前で参照されるため、Studio を無効にした構成 (左手、元の構成) でもビルドエラーにはなりません (`keymap.c` はセントラルでのみコンパイルされ、ビヘイビアはデバイス名の文字列で参照されるため)。
- ZMK Studio を有効にしたファームウェアでは、Web から保存したキーマップがフラッシュ (settings) に保存され、**.keymap ファイルより優先** されます。.keymap の変更を反映したいときは、アプリの「設定 → キーボードを初期化」を実行してください。
- 左手 (ペリフェラル) はキーマップを持たないため、キーマップを変更しても左手の再書き込みは不要です。

## 実ビルドの結果 (GitHub Actions)

| 構成 | 右手 (セントラル) の使用量 |
| --- | --- |
| Studio 対応・5 レイヤー + 予備 3 (前回) | FLASH 256,860 B (31.8%) / RAM 75,998 B (29.0%) |
| Studio 対応・OS 別 25 レイヤー | FLASH 269,708 B (33.4%) / RAM 89,470 B (34.1%) |

左手・settings_reset も含め 3 つともビルド成功。ZMK のレイヤー数の上限は 32 (レイヤーの状態が 32bit)、rgbled-widget のレイヤー色も 32 レイヤーまで対応しています。

## 注意

- ZMK はアクティブなレイヤーを保存しないため、電源を入れた直後はレイヤー 0 (Windows Layer 0) になります。Bluetooth プロファイルは保存されるので、macOS などを使う場合は電源投入後に OS 切替キーを押してください。
- レイヤー 0 は常に有効なため、各 OS のデフォルトレイヤーの透過 (`&trans`) キーは Windows Layer 0 の割り当てになります (アプリに警告を表示)。
- `to_layer_0` マクロ (元から定義されているもの。現在のキーマップでは未使用) は常にレイヤー 0 (Windows) へ移動します。
- Web から保存したキーは 1 キーずつ settings (32KB) に保存されます。ファームウェアの初期状態から約 600 キー以上変えると保存しきれない可能性があるため、大きく変えた場合は ZIP を出力してビルドし直してください。

## エンコーダー・マクロ・コンボの即時編集 (UF2 の書き込み不要)

ZMK v0.2.1 の ZMK Studio はキーの割り当てしか書き込めず、エンコーダー (sensor-bindings)・マクロ・コンボは devicetree で固定されます。
そこで **ZMK 本体は改造せず**、zmk-config に小さなモジュール (`src/`, `dts/`, `Kconfig`, `CMakeLists.txt`, `zephyr/module.yml`) を追加し、
これらの設定を「キーの割り当て」として持たせました。キーの割り当ては ZMK Studio で書き込み・フラッシュ保存・読み出しができるので、
アプリからは通常のキーと同じ仕組みで即時に変更・同期・検証できます。

| キー位置 (0 始まり) | 内容 | 仕組み |
| --- | --- | --- |
| 0〜41 | 物理キー | 従来どおり |
| 42〜45 | 右エンコーダー 時計回り / 反時計回り、左エンコーダー 時計回り / 反時計回り | `sensor-bindings = <&enc_vk 42 43>, <&enc_vk 44 45>` (固定)。回すと `&vkey` が仮想キーの「現在のレイヤーの」割り当てを押す。レイヤーごとに設定でき、透過も使える |
| 46〜93 | マクロ `&rtm0`〜`&rtm5` の中身 (8 ステップずつ) | マクロ本体は `&vkey 46 &vkey 47 …` を順にタップ (固定)。中身はレイヤー 0 の仮想キーの割り当て |
| 94〜109 | コンボ 16 個の設定 (`&rt_combo <p1> <p2>`) | `src/runtime_combo.c` がレイヤー 0 から読み、キー位置・判定時間・有効なレイヤーとして使う |
| 110〜125 | コンボ 16 個の動作 | コンボ成立時に仮想キーの割り当てを押す |

- 仮想キーは物理キーの無い行 (matrix transform の行 5〜12) に置いています。分割キーボードのキー位置は最大 128 (左右通信の仕様) なので、その範囲に収めました。
- `&vkey` は ZMK の公開関数 `zmk_keymap_position_state_changed()` を呼ぶだけで、ZMK 本体の処理を置き換えていません。
- コンボの判定は ZMK 標準の `combo.c` と同じ方針 (キーを捕捉し、成立しなければ元の順序で再送)。イベントの処理順はビルドした ELF で確認し、ホールドタップ・標準コンボ・キーマップより前に実行されます。
- コンボ設定のエンコード: `p1` の bit n = キー n (0〜30)、`p2` の bit 0〜10 = キー 31〜41、bit 11〜20 = 判定時間 (ms、0 = 未使用)、bit 21〜25 = 有効な Bluetooth プロファイル (0 = すべて)、bit 26〜30 = その中のレイヤー (0 = すべて)。

### 検証

- GitHub Actions で左右・settings_reset のビルド成功。右手: FLASH 38.2% / RAM 48.8%。
- `firmware/tests/runtime_combo/` で `runtime_combo.c` をスタブ付きで PC 用にコンパイルし、12 通りのキー操作 (同時押し・タイムアウト・無関係なキー・レイヤー制限・長短のコンボの競合など) を確認 (GitHub Actions の gcc で全件成功)。
- **実機では未確認** です。
