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
3. **`Choco-Key.keymap`**
   - Layer 4 の右手最上段左端 (これまで `&trans`) を `&studio_unlock` に変更 (Web からの編集を許可するためのキー)
   - 予備レイヤー `layer_5`〜`layer_7` (`status = "reserved"`) を追加 (Web からレイヤーを追加できるようにするため。通常ビルドでは無視されます)
4. **`Choco-Key.zmk.yml`** — `features` に `studio` を追加 (メタデータのみ)

### 変更していないもの

- 左右間の BLE 接続設定、BLE / バッテリー関連の Kconfig、`rgbled_adapter`、エンコーダー、`west.yml` (ZMK v0.2.1)、GitHub Actions のワークフロー
- 既存のキー割り当て (Layer 4 の 1 キーを除く)

### 補足

- `&studio_unlock` は名前で参照されるため、Studio を無効にした構成 (左手、元の構成) でもビルドエラーにはなりません (`keymap.c` はセントラルでのみコンパイルされ、ビヘイビアはデバイス名の文字列で参照されるため)。
- ZMK Studio を有効にしたファームウェアでは、Web から保存したキーマップがフラッシュ (settings) に保存され、**.keymap ファイルより優先** されます。.keymap の変更を反映したいときは、アプリの「設定 → キーボードを初期化」を実行してください。
- 左手 (ペリフェラル) はキーマップを持たないため、キーマップを変更しても左手の再書き込みは不要です。
