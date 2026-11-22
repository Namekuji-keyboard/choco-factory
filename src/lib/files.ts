import JSZip from 'jszip';
import type { KeyboardDefinition, Project } from '../model/types';
import type { ProjectFile } from '../model/project';
import { exportKeymap, parseKeymap } from '../zmk/keymap';
import { wrapperBehaviors } from '../device/wrappers';
import { shortcutBehaviors } from '../model/shortcuts';

export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type: `${type};charset=utf-8` }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'keymap';

export function buildKeymap(project: Project, kb: KeyboardDefinition) {
  return exportKeymap(project.keymapSource, project.layers, kb, project.macros, {
    // 即時編集に対応したキーボードでは、コンボはキーマップの仮想キーに入っている
    combos: kb.runtime ? undefined : project.combos,
    // ZMK Studio から &msc などを書き込むための代わりのマクロは、元のキーマップに無ければ必ず追加する
    extraBehaviors: [...shortcutBehaviors(project.shortcuts), ...(kb.runtime ? wrapperBehaviors(parseKeymap(project.keymapSource).scrollVal) : [])],
    osMacros: !!project.os,
  });
}

export type ZipVariant = 'studio' | 'original';

const README = (kb: KeyboardDefinition, variant: ZipVariant, project: Project) => `# ${kb.name} zmk-config (Choco Factory で出力)

- プロジェクト: ${project.name}
- 出力日時: ${new Date().toLocaleString('ja-JP')}
- 構成: ${variant === 'studio' ? 'ZMK Studio 対応版 (Web から直接キーマップを書き込めます)' : 'ZMK Studio 無効版 (即時編集用の仮想キー・モジュールは含む。Web からの書き込みはできません)'}
- ZMK: ${kb.zmkVersion}
${project.os ? `- キーマップ: OS 別 ${project.layers.length} レイヤー (Windows 0〜4 / macOS 5〜9 / Linux 10〜14 / iOS 15〜19 / Android 20〜24)
` : ''}
## ビルド方法

1. このフォルダの中身を GitHub のリポジトリ (zmk-config) にコミットして push します。
2. GitHub Actions が自動でビルドし、Actions の実行結果 (Artifacts) に firmware.zip が出力されます。
3. 各 XIAO nRF52840 をダブルリセットで書き込みモードにし、対応する .uf2 をドラッグ & ドロップします。
   - 右手 (セントラル): ファイル名に Choco-Key_R を含む .uf2
   - 左手 (ペリフェラル): ファイル名に Choco-Key_L を含む .uf2
   - 初回 (ZMK Studio 対応版・OS 別 25 レイヤー版に切り替えるとき) は左右とも書き込んでください。キーマップは右手 (セントラル) だけが持つため、以後キーマップを変えるだけなら左手の再書き込みは不要です。
${variant === 'studio' ? `
## ZMK Studio について

- ZMK Studio は右手 (セントラル) のみで有効です。キーマップの編集は右手を USB 接続して行います。
- 編集を許可するには、キーボード上で &studio_unlock (Layer 4 の右手最上段左端) を押します。
- Studio で保存したキーマップはフラッシュに保存され、以後このファイルのキーマップより優先されます。
  ファイル側の変更を反映したいときは、Web アプリの「キーボードを初期化」を実行してください。
- エンコーダー・マクロ・コンボは仮想キー (キー 43〜126) として ZMK Studio から即時に書き込めます (src/ の Choco Factory モジュール)。
- 複数の通常キーを同時に押すショートカット (sc_*) は ZMK Studio では作成できないため、このファイルでビルドして反映します。
` : ''}`;

export async function buildZip(project: Project, kb: KeyboardDefinition, variant: ZipVariant): Promise<{ blob: Blob; warnings: string[] }> {
  const zip = new JSZip();
  const root = zip.folder('zmk-config')!;
  const { text, warnings } = buildKeymap(project, kb);
  const files = { ...kb.files[variant] };
  files[kb.keymapPath] = text;
  for (const [path, content] of Object.entries(files)) root.file(path, content);
  root.file('CHOCO-FACTORY.md', README(kb, variant, project));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, warnings };
}

export function projectFile(project: Project): ProjectFile {
  return { format: 'choco-factory-project', version: 2, project };
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}
