# Choco Factory

自作キーボード **Choco-Key** (左右分割 / Seeed Studio XIAO nRF52840 / ZMK) のキーマップを、ブラウザ上で編集してキーボードに直接書き込める Web アプリです。

- インストール不要・GitHub アカウント不要 (Chrome / Edge で開くだけ)
- **OS 別キーマップ**: Windows / macOS / Linux / iOS・iPadOS / Android それぞれに Layer 0〜4 (合計 25 レイヤー)。OS ごとのデフォルトレイヤーと、Bluetooth プロファイルと連動した OS 切替キー
- ショートカット (キーをいくつでも組み合わせ可能・OS 別プリセット)、コンボ (同時押し)、ロータリーエンコーダーの時計回り / 反時計回りをレイヤーごとに設定
- キーボードの実際の配置を表示し、キーをクリックして割り当てを変更
- **USB 接続した XIAO nRF52840 にキーマップを直接書き込み、内部フラッシュに保存** (ZMK Studio RPC。毎回の UF2 書き込みは不要)
- 編集内容はブラウザ内 (IndexedDB) に自動保存。プロジェクト管理・バックアップ・復元
- ZMK の `.keymap` の読み込み / 出力、zmk-config 一式の ZIP 出力 (GitHub Actions でそのままビルド可能)

公開 URL (GitHub Pages): https://namekuji-keyboard.github.io/choco-factory/

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
3. キーボードで **右手最下段右端 (`&lt 4 ESC`) を押しながら右手最上段左端 (`&studio_unlock`)** を押してロック解除 (どの OS のレイヤーでも同じ位置)
4. 現在のキーマップが表示されるので、キーをクリックして編集
5. 「キーボードに適用」→ 変更したキーだけが書き込まれ、フラッシュに保存されます。書き込み後に読み直して検証します

USB を抜いても、電源を切っても設定は保持されます。

---

## 機能一覧

| 分類 | 機能 |
| --- | --- |
| OS 別キーマップ | OS 選択 → デフォルトレイヤー → Layer 0〜4 の選択。OS ごとに独立した 5 レイヤー (合計 25)。OS 切替キー (BT 連動 / レイヤーのみ)、他の OS・レイヤーからのコピー |
| ショートカット | 名前・OS・キーの組み合わせ (個数無制限・順番変更)・メモ。OS 別プリセット (Windows 20 / macOS 16 / Linux 12 / iOS 9 / Android 7)、検索、複製、削除、キーへの割り当て、編集すると割り当て済みのキーも更新 |
| コンボ | 同時押しするキー (最大 4)・実行する動作 (キー / ショートカット / ZMK 表記)・有効なレイヤー (OS の全レイヤー / 表示中のレイヤー / すべて)・判定時間 |
| エンコーダー | 時計回り / 反時計回りを 25 レイヤーそれぞれに設定。音量・メディア / ブラウザ / テキスト / CAD・画像・動画編集のプリセット (OS ごとにキーを切り替え)、任意のキー・ショートカット |
| 画面 | ヘッダー (プロジェクト・接続状態・接続・設定・テーマ)、キーボード表示 (左右分割・セントラル表示・エンコーダー)、キー設定パネル、キーコード一覧、フッター (Undo/Redo・履歴・初期化・保存状態・適用) |
| キーマップ編集 | キーコード (ZMK `keys.h` の全 373 種 / 644 名称。すべてに日本語の説明)、修飾キー付き (`LC(C)` など)、Mod-Tap、Layer-Tap、MO/TO/TG/SL、Sticky Key、Bluetooth、出力切替、マウス、特殊キー、キーマップ内のカスタムビヘイビア・マクロ |
| 検索 | 名前・別名・説明・日本語ラベル・カテゴリで検索 |
| レイヤー | 名前変更 (ダブルクリック)、クリア、別のレイヤーからコピー |
| 編集補助 | Undo / Redo (Ctrl+Z / Ctrl+Y)、編集履歴、コピー / 貼り付け (Ctrl+C / Ctrl+V)、複数選択 (Shift / Ctrl + クリック) で一括設定、初期状態に戻す、自動保存 |
| 接続 | USB (Web Serial)、シミュレーター (設定で有効化) |
| 接続状態 | 未接続 / 接続待機 / 接続中 / ロック解除待ち / キーマップ取得中 / 接続完了 / 編集中 / 書き込み中 / 保存完了 / エラー |
| ファイル | `.keymap` 読み込み・出力、zmk-config ZIP (Studio 対応版 / 元の構成)、プロジェクト JSON、全プロジェクトのバックアップ / 復元 |
| マクロ | キー列をタップするマクロの作成 (ZIP 出力に含まれる。ファームウェアのビルドが必要) |
| 表示 | ダーク (黒基調・既定) / ライト / システム、PC のキーボード配列 (JIS / US) に合わせた記号表示、レスポンシブ (PC 優先・スマホ対応) |

---

## ZMK Studio の標準機能と、このアプリの独自実装の範囲

| 項目 | 実現方法 |
| --- | --- |
| キーマップの取得・変更・フラッシュ保存 | **ZMK Studio 標準** (RPC: `get_keymap` / `set_layer_binding` / `save_changes`)。通信は公式 `@zmkfirmware/zmk-studio-ts-client` をそのまま使用 (プロトコルの独自実装なし) |
| 電源再投入後の復元 | **ZMK 標準** (`CONFIG_ZMK_KEYMAP_SETTINGS_STORAGE`。Studio 有効時に自動で有効) |
| レイヤー名変更 | **ZMK Studio 標準** (`set_layer_props`)。OS 別キーマップでは 25 レイヤー固定のため、レイヤーの追加・削除は行いません |
| ロック / アンロック | **ZMK Studio 標準** (`&studio_unlock`) |
| 初期化 | **ZMK Studio 標準** (`reset_settings`) |
| ファームウェアの Studio 対応 | ZMK 標準の手順に沿った設定変更のみ (firmware/README.md)。ZMK 本体の改造なし |
| GUI・差分書き込み・書き込み後の検証・ビヘイビア名の対応付け | **このアプリの実装** |
| `.keymap` の解析・出力 (元ファイルを保ったまま必要箇所だけ書き換え) | **このアプリの実装** |
| OS 切替キー (`&os_sel` / `&os_to`) | ZMK 標準のパラメータ付きマクロ (`zmk,behavior-macro-two-param`) で定義。パラメータ (BT プロファイル・レイヤー) は **ZMK Studio で書き込み可能** |
| ショートカット (修飾キー + 1 キー) | ZMK 標準の `&kp LC(LS(V))` 形式。**ZMK Studio で書き込み可能** |
| ショートカット (通常キー 2 個以上)・マクロ・コンボ・エンコーダー割り当て・タップ時間などの設定 | ZMK Studio が未対応のため **直接書き込みは不可**。ZIP 出力 → ファームウェア再ビルドで対応 |

---

## OS 別キーマップの設計 (ZMK での実現方法)

ZMK にはレイヤーのグループや「OS ごとのキーマップ」の機能が無いため、25 レイヤーを ZMK の通常のレイヤーとして並べています。

| OS | ZMK のレイヤー | Bluetooth プロファイル | OS 切替キー (各 OS の Layer 4・右手 2 段目) |
| --- | --- | --- | --- |
| Windows | 0〜4 | 0 | `&os_sel 0 <0〜4>` |
| macOS | 5〜9 | 1 | `&os_sel 1 <5〜9>` |
| Linux | 10〜14 | 2 | `&os_sel 2 <10〜14>` |
| iOS / iPadOS | 15〜19 | 3 | `&os_sel 3 <15〜19>` |
| Android | 20〜24 | 4 | `&os_sel 4 <20〜24>` |

- **ZMK v0.2.1 で 25 レイヤーは動作可能**: レイヤーの状態は 32bit (`zmk_keymap_layers_state_t`) なので上限 32。実ビルドで右手の RAM 使用量は 29.0% → 34.1%、FLASH は 31.8% → 33.4% (firmware/README.md)。
- **ZMK Studio で 25 レイヤーすべてを編集・保存できる**: Studio はファームウェアに定義されたレイヤーをすべて扱えます (レイヤー名は最大 20 バイト)。キー割り当ては 1 キーずつフラッシュ (settings、32KB) に保存されるため、ファームウェアの初期状態から変えたキーが約 600 個を超えると保存できなくなる可能性があります (適用画面に目安を表示)。
- **レイヤーの優先順位**: ZMK は番号の大きいレイヤーが優先、レイヤー 0 は常に有効。OS 切替キーは `&to` で「その OS のデフォルトレイヤーだけを有効」にするので、前の OS のレイヤーは残りません。ただし透過 (`&trans`) キーはレイヤー 0 (Windows Layer 0) にフォールバックします (アプリで警告)。
- **OS 切替キー**: `&os_sel` = `&bt BT_SEL <プロファイル>` → `&to <レイヤー>` を 1 回の押下で実行するマクロ。`&os_to` はレイヤーのみ。従来の `&bt BT_SEL` (Bluetooth のみの切替) もそのまま使えます。OS のデフォルトレイヤーを変えると、アプリが OS 切替キーの移動先を自動で書き換えます (ZMK Studio で書き込めるので再ビルド不要)。
- **ZMK の Bluetooth プロファイルは 5 個** (`CONFIG_BT_MAX_PAIRED=6` から左右通信用の 1 を引いた数。ビルドログで確認)。5 OS と同じ数なので、OS と同じ番号のプロファイルを割り当てています。USB 接続時もレイヤーの切替は有効です。
- **電源投入直後はレイヤー 0 (Windows Layer 0)**: ZMK はアクティブなレイヤーを保存しないためです。Bluetooth プロファイルは保存されます。

### OS の自動認識について (調査結果: 実装しない)

| 確認事項 | 結果 |
| --- | --- |
| ZMK に接続先 OS を識別する仕組みがあるか | **無い** (ZMK v0.2.1 のソース・ドキュメントに該当機能なし) |
| Bluetooth 接続先の OS 情報を取得できるか | **できない**。BLE HID の接続で OS は自分の種類を通知しない (ペアリング情報はアドレスと鍵のみ) |
| USB 接続時に OS を識別できるか | ZMK には無い。USB の列挙のされ方から推測する手法はあるが確実ではなく、ZMK 本体の改造が必要 |
| XIAO nRF52840 の ZMK で実装できるか | 上記のとおり ZMK 本体の改造が必要で、既存ファームウェアを壊さない方針に反する |
| 左右分割で問題ないか / 複数プロファイルで判別できるか | プロファイル番号は分かるが、その先の OS は分からない |
| Web アプリが認識した OS をキーボードに伝えられるか | ZMK Studio の RPC に OS 情報を送る API は無い。また Bluetooth の接続先が別の端末なら伝えようがない |

そのため自動認識はせず、**Bluetooth プロファイル切替と OS のデフォルトレイヤー切替を 1 つのキーで行う方式** (参考: https://zenn.dev/shakupan/articles/261ce435251607 ) にしています。

## Bluetooth (BLE) での Web アプリ接続 — 調査結果と削除

Windows の Chrome で「Bluetooth (試験的)」→ スキャンしてもキーボードが見つからない問題を調査し、**Windows / macOS のブラウザでは正式に動作しないため機能を削除** しました (USB 接続を利用してください)。

- **原因 1 (決定的)**: 公式クライアント (`@zmkfirmware/zmk-studio-ts-client` の GATT トランスポート) は `navigator.bluetooth.requestDevice({ filters: [{ services: [ZMK Studio の UUID] }] })` でデバイスを探します。しかし ZMK v0.2.1 のアドバタイズ (`app/src/ble.c`) に含まれるサービス UUID は HID (0x1812) と Battery (0x180F) だけで、Studio の UUID (`00000000-0196-6107-c967-c5cfb1c2482a`) は含まれていません。Windows の Chrome / Edge はアドバタイズの内容でフィルタするため、一覧に表示されません。
- **原因 2**: ZMK は選択中のプロファイルが PC と接続済みのときアドバタイズを止めます。Windows に Bluetooth キーボードとして接続した状態では、そもそもスキャンに現れません。
- **Bluetooth HID と ZMK Studio RPC は別物**: Windows の設定でペアリングできる (HID over GATT) ことと、ブラウザが Studio 用の GATT サービスに接続できることは別です。
- ZMK 公式ドキュメント (docs/features/studio.md) でも、BLE での編集は「Linux の Web アプリとネイティブアプリのみ」動作確認済みとされています。ファームウェア側 (`CONFIG_ZMK_STUDIO_TRANSPORT_BLE=y`) は変えていないので、公式ネイティブアプリからは BLE で接続できる場合があります (未検証)。
- 削除したのは **Web アプリとキーボードの直接通信の UI だけ** です。キーボード本来の Bluetooth 接続、Bluetooth プロファイル切替 (`&bt`)、左右間の BLE 通信は変わりません。通信処理は `src/device/transports/ble.ts` に分離して残しており、将来正式に対応した場合は再び組み込めます。

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

- 保存データの形式を変更した場合は自動で移行します (旧形式の 5 レイヤーのプロジェクトは、各 OS に同じ内容をコピーして 25 レイヤーにします)。
- このアプリには Choco-Key-Factory の zmk-config (キーマップ・シールド定義) が同梱され、公開されます。
- Web Serial は Chrome / Edge (PC) のみ対応です。Firefox / Safari では編集とファイル出力のみ使えます。
- ZMK Studio の通信仕様は ZMK v0.2.1 (zmk-studio-messages `6cb4c28`) に合わせています。

## ライセンス

MIT License。キーコード・ヘッダ定義は [ZMK Firmware](https://github.com/zmkfirmware/zmk) (MIT) から生成しています。
