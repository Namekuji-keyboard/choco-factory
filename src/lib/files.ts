import JSZip from 'jszip';
import type { KeyboardDefinition, Project } from '../model/types';
import type { ProjectFile } from '../model/project';
import { exportKeymap } from '../zmk/keymap';

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
  return exportKeymap(project.keymapSource, project.layers, kb, project.macros);
}

export type ZipVariant = 'studio' | 'original';

const README = (kb: KeyboardDefinition, variant: ZipVariant, project: Project) => `# ${kb.name} zmk-config (Choco Factory で出力)

- プロジェクト: ${project.name}
- 出力日時: ${new Date().toLocaleString('ja-JP')}
- 構成: ${variant === 'studio' ? 'ZMK Studio 対応版 (Web から直接キーマップを書き込めます)' : '元の構成 (ZMK Studio 無効)'}
- ZMK: ${kb.zmkVersion}

## ビルド方法

1. このフォルダの中身を GitHub のリポジトリ (zmk-config) にコミットして push します。
2. GitHub Actions が自動でビルドし、Actions の実行結果 (Artifacts) に firmware.zip が出力されます。
3. 各 XIAO nRF52840 をダブルリセットで書き込みモードにし、対応する .uf2 をドラッグ & ドロップします。
   - 右手 (セントラル): ファイル名に Choco-Key_R を含む .uf2
   - 左手 (ペリフェラル): ファイル名に Choco-Key_L を含む .uf2
   - 初回 (ZMK Studio 対応版に切り替えるとき) は左右とも書き込んでください。キーマップは右手 (セントラル) だけが持つため、以後キーマップを変えるだけなら左手の再書き込みは不要です。
${variant === 'studio' ? `
## ZMK Studio について

- ZMK Studio は右手 (セントラル) のみで有効です。キーマップの編集は右手を USB 接続して行います。
- 編集を許可するには、キーボード上で &studio_unlock (Layer 4 の右手最上段左端) を押します。
- Studio で保存したキーマップはフラッシュに保存され、以後このファイルのキーマップより優先されます。
  ファイル側の変更を反映したいときは、Web アプリの「キーボードを初期化」を実行してください。
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
  return { format: 'choco-factory-project', version: 1, project };
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}
