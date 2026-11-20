# Choco Factory

自作キーボード **Choco-Key** (左右分割 / Seeed Studio XIAO nRF52840 / ZMK) のキーマップを、ブラウザ上で編集してキーボードに直接書き込める Web アプリです。

- インストール不要・GitHub アカウント不要 (Chrome / Edge で開くだけ)
- キーボードの実際の配置を表示し、キーをクリックして割り当てを変更
- **USB 接続した XIAO nRF52840 にキーマップを直接書き込み、内部フラッシュに保存** (ZMK Studio RPC。毎回の UF2 書き込みは不要)
- 編集内容はブラウザ内 (IndexedDB) に自動保存。プロジェクト管理・バックアップ・復元
- ZMK の `.keymap` の読み込み / 出力、zmk-config 一式の ZIP 出力 (GitHub Actions でそのままビルド可能)

公開 URL (GitHub Pages): `https://namekuji-keyboard.github.io/<リポジトリ名>/`

---

## 使い方

### 1. 初回のみ: ZMK Studio 対応ファームウェアを書き込む

ZMK Studio は ZMK に標準搭載されている機能ですが、ファームウェアのビルド時に有効にする必要があります (詳細は [firmware/README.md](firmware/README.md))。

1. アプリの「ファイル」→「ZMK 設定一式 (ZIP)」→「ZMK Studio 対応版」を出力
2. 中身を zmk-config リポジトリ (Choco-Key-Factory) に上書きして push → GitHub Actions がビルド
3. `firmware.zip` 内の .uf2 を、右手・左手の XIAO にそれぞれ書き込む (リセットボタンを素早く 2 回押すと USB ドライブになります)

### 2. 接続して編集・適用

1. **右手 (セントラル)** の XIAO を USB-C で PC に接続 (Choco-Key は右手がセントラルです)
2. 「キーボードに接続」→ 一覧から XIAO を選択
3. キーボードで **右手最下段右端 (`&lt 4 ESC`) を押しながら右手最上段左端 (`&studio_unlock`)** を押してロック解除
4. 現在のキーマップが表示されるので、キーをクリックして編集
5. 「キーボードに適用」→ 変更したキーだけが書き込まれ、フラッシュに保存されます。書き込み後に読み直して検証します

USB を抜いても、電源を切っても設定は保持されます。

---

## 機能一覧

| 分類 | 機能 |
| --- | --- |
| 画面 | ヘッダー (プロジェクト・接続状態・接続・設定・テーマ)、キーボード表示 (左右分割・セントラル表示・エンコーダー)、キー設定パネル、キーコード一覧、フッター (Undo/Redo・履歴・初期化・保存状態・適用) |
| キーマップ編集 | キーコード (ZMK `keys.h` の全 373 種 / 644 名称)、修飾キー付き (`LC(C)` など)、Mod-Tap、Layer-Tap、MO/TO/TG/SL、Sticky Key、Bluetooth、出力切替、マウス、特殊キー、キーマップ内のカスタムビヘイビア・マクロ |
| 検索 | 名前・別名・説明・日本語ラベル・カテゴリで検索 |
| レイヤー | 5 レイヤー (キーマップから読み込み)、名前変更 (ダブルクリック)、追加・複製・クリア・削除 |
| 編集補助 | Undo / Redo (Ctrl+Z / Ctrl+Y)、編集履歴、コピー / 貼り付け (Ctrl+C / Ctrl+V)、複数選択 (Shift / Ctrl + クリック) で一括設定、初期状態に戻す、自動保存 |
| 接続 | USB (Web Serial)、Bluetooth (Web Bluetooth、試験的)、シミュレーター (設定で有効化) |
| 接続状態 | 未接続 / 接続待機 / 接続中 / ロック解除待ち / キーマップ取得中 / 接続完了 / 編集中 / 書き込み中 / 保存完了 / エラー |
| ファイル | `.keymap` 読み込み・出力、zmk-config ZIP (Studio 対応版 / 元の構成)、プロジェクト JSON、全プロジェクトのバックアップ / 復元 |
| マクロ | キー列をタップするマクロの作成 (ZIP 出力に含まれる。ファームウェアのビルドが必要) |
| 表示 | ライト / ダーク / システム、PC のキーボード配列 (JIS / US) に合わせた記号表示、レスポンシブ (PC 優先・スマホ対応) |

---

## ZMK Studio の標準機能と、このアプリの独自実装の範囲

| 項目 | 実現方法 |
| --- | --- |
| キーマップの取得・変更・フラッシュ保存 | **ZMK Studio 標準** (RPC: `get_keymap` / `set_layer_binding` / `save_changes`)。通信は公式 `@zmkfirmware/zmk-studio-ts-client` をそのまま使用 (プロトコルの独自実装なし) |
| 電源再投入後の復元 | **ZMK 標準** (`CONFIG_ZMK_KEYMAP_SETTINGS_STORAGE`。Studio 有効時に自動で有効) |
| レイヤー名変更・レイヤー追加 / 削除 | **ZMK Studio 標準** (`set_layer_props` / `add_layer` / `remove_layer`)。追加は予備レイヤー (`status = "reserved"`) の数まで |
| ロック / アンロック | **ZMK Studio 標準** (`&studio_unlock`) |
| 初期化 | **ZMK Studio 標準** (`reset_settings`) |
| ファームウェアの Studio 対応 | ZMK 標準の手順に沿った設定変更のみ (firmware/README.md)。ZMK 本体の改造なし |
| GUI・差分書き込み・書き込み後の検証・ビヘイビア名の対応付け | **このアプリの実装** |
| `.keymap` の解析・出力 (元ファイルを保ったまま必要箇所だけ書き換え) | **このアプリの実装** |
| マクロ・コンボ・エンコーダー割り当て・タップ時間などの設定 | ZMK Studio が未対応のため **直接書き込みは不可**。ZIP 出力 → ファームウェア再ビルドで対応 |

---

## BLE (Bluetooth) 接続による編集の調査結果

- **ZMK Studio は BLE に対応** しています (`CONFIG_ZMK_STUDIO_TRANSPORT_BLE`、`ZMK_BLE` 有効時は既定で ON)。セントラル (右手) が PC と接続している BLE 接続上に専用の GATT サービス (`00000000-0196-6107-c967-c5cfb1c2482a`) を追加する方式で、**左右間の BLE 通信とは別の接続** なので競合しません。
- BLE 経由でも書き込み先は同じフラッシュで、`save_changes` で不揮発保存されます。
- このアプリは公式クライアントの GATT トランスポート (Web Bluetooth) で BLE 接続に対応しています (「キーボードに接続」の ▼ → Bluetooth)。
- **制約**: ZMK 公式ドキュメントでは BLE での編集は「Linux の Web アプリとネイティブアプリのみ」動作確認済みです。Windows / macOS の Chrome では、OS に HID キーボードとしてペアリング済みのデバイスに Web Bluetooth から接続できない場合があります。**USB 接続を推奨** します。
- ペリフェラル (左手) は PC と直接 BLE 接続しないため、左手に BLE で接続して編集することはできません。

## 左右分割キーボードでのキーマップ管理

- ZMK の分割構成では **キーマップはセントラルだけが持ちます**。ペリフェラルはキーの押下位置をセントラルに送るだけで、`keymap.c` 自体がセントラルでしかコンパイルされません (ZMK v0.2.1 `app/CMakeLists.txt`)。
- そのため **右手 (セントラル) にだけ接続・保存すればよく、左手への反映は不要** です。左手のキーを押した場合もセントラルのキーマップが使われるので、変更は左右すべてのキーに反映されます。
- ZMK Studio は左手 (ペリフェラル) では動作しません。左手のファームウェアには USB シリアルが無いため、接続先の一覧に表示されません。Studio 非対応のファームウェアに接続した場合は「応答がありません」と表示します。
- キー位置の番号は matrix transform の並び (左手 5 キー → 右手 5 キー × 3 行 + 親指 6 + 6) と一致させています。

## 既存ファームウェア (Choco-Key-Factory) の解析結果

| 項目 | 内容 |
| --- | --- |
| ZMK | v0.2.1 (Zephyr 3.5)、ビルドは `zmkfirmware/zmk/.github/workflows/build-user-config.yml@v0.2.1` |
| ボード / シールド | `seeeduino_xiao_ble` + `Choco-Key_R rgbled_adapter` / `Choco-Key_L rgbled_adapter`、`settings_reset` |
| 分割 | 右手がセントラル (`Kconfig.defconfig`)、左右間 BLE、右手は `col-offset = <6>` |
| マトリクス | 5 行 × 11 列、col2row、42 キー (3 行 × 10 + 親指 12) |
| キーマップ | 5 レイヤー。Mod-Tap (`&mt`、`flavor = "balanced"`)、Layer-Tap (`&lt`)、Bluetooth (`&bt`)、`&bootloader`、`&ind_bat` (zmk-rgbled-widget) |
| カスタム | マクロ `to_layer_0` (macro-one-param)、hold-tap `lt_to_layer_0`、センサー回転 `scroll_up_down` / `scroll_left_right` (`ZMK_POINTING_DEFAULT_SCRL_VAL` = 100) |
| エンコーダー | EC11 × 2 (右 = sensor 0 = 上下スクロール、左 = sensor 1 = 左右スクロール) |
| フラッシュ保存 | ZMK 標準の settings (NVS)。Studio 有効時はキーマップもここに保存 |

---

## データの保存

- 編集データは **利用者ごとのブラウザ (IndexedDB)** に保存され、サーバーには送信しません。利用者同士のデータは混ざりません。
- DB はバージョン管理しており、アプリを更新しても保存データは消えません。可能な場合は永続ストレージを要求します。
- ブラウザのデータを消去すると消えるため、「ファイル → 全プロジェクトのバックアップ」で定期的に保存してください。

---

## 開発

```bash
npm install
npm run dev      # 開発サーバー (http://localhost:5173)
npm test         # テスト (Vitest)
npm run build    # 本番ビルド (dist/)
```

### 構成

```
src/
  zmk/            ZMK の知識 (キーコード・ビヘイビア・devicetree / キーマップ解析と出力)
    keycodes.generated.ts   ← scripts/gen-keycodes.py で ZMK keys.h から自動生成
    headers.generated.ts    ← ZMK dt-bindings ヘッダの #define
    dts.ts / preprocessor.ts / keymap.ts
  device/         通信 (ZMK Studio RPC ラッパー・同期・シミュレーター)
  storage/        IndexedDB
  model/          データモデル・プロジェクト
  state/          アプリ状態 (zustand)
  keyboards/      キーボード定義 (配置・ファイル)。別キーボードはここに追加
  components/     GUI
  lib/            表示・ファイル出力
firmware/         Choco-Key の zmk-config (元の構成 / Studio 対応版の差分)
```

### 別のキーボードに対応するには

1. `firmware/<キーボード>/original/` に zmk-config、`studio/` に Studio 対応のための変更ファイルを置く
2. `src/keyboards/<キーボード>.ts` にキー配置 (`keys`)・行構成・デバイス名などを定義
3. `src/keyboards/index.ts` の `KEYBOARDS` に追加

### GitHub Pages への公開

1. GitHub にリポジトリを作成してこのフォルダを push (ブランチ `main`)
2. リポジトリの Settings → Pages → Source を **GitHub Actions** に設定
3. `.github/workflows/deploy.yml` がテスト → ビルド → 公開を自動で行います (以後 `main` への push ごとに更新)

秘密情報 (トークン等) はフロントエンドに一切含まれていません。

---

## 注意事項

- このアプリには Choco-Key-Factory の zmk-config (キーマップ・シールド定義) が同梱され、公開されます。
- Web Serial / Web Bluetooth は Chrome / Edge (PC) のみ対応です。Firefox / Safari では編集とファイル出力のみ使えます。
- ZMK Studio の通信仕様は ZMK v0.2.1 (zmk-studio-messages `6cb4c28`) に合わせています。

## ライセンス

MIT License。キーコード・ヘッダ定義は [ZMK Firmware](https://github.com/zmkfirmware/zmk) (MIT) から生成しています。
