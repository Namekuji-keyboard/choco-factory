# firmware/ — Choco-Key の ZMK 設定

| フォルダ | 内容 |
| --- | --- |
| `choco-key/original/` | Choco-Key-Factory リポジトリの zmk-config をそのままコピーしたもの (変更なし) |
| `choco-key/studio/` | ZMK Studio 対応にするために **変更したファイルだけ** を置いたもの |
| `choco-key/studio.patch` | `original` → `studio` の差分 (`diff -ru`) |

アプリはこの 2 つを読み込み、ZIP 出力時に「元の構成」/「ZMK Studio 対応版」として zmk-config 一式を出力します。

## ZMK Studio 対応のための変更 (4 ファイル)

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
