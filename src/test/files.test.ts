import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import 'fake-indexeddb/auto';
import { chocoKey } from '../keyboards/choco-key';
import { buildZip } from '../lib/files';
import { createProject, projectFromKeymapFile } from '../model/project';
import { parseKeymap } from '../zmk/keymap';
import { createBackup, listProjects, putProject, restoreBackup } from '../storage/db';

describe('ZIP 出力', () => {
  it('Studio 対応版: zmk-config 一式 + 編集したキーマップ', async () => {
    const p = createProject(chocoKey, 'test');
    p.layers[0].bindings[0] = { b: 'kp', p: [0x070004] };
    const { blob } = await buildZip(p, chocoKey, 'studio');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        'zmk-config/.github/workflows/main.yml',
        'zmk-config/build.yaml',
        'zmk-config/config/west.yml',
        'zmk-config/config/Choco-Key.keymap',
        'zmk-config/config/boards/shields/Choco-Key/Choco-Key.dtsi',
        'zmk-config/config/boards/shields/Choco-Key/Choco-Key_R.conf',
        'zmk-config/zephyr/module.yml',
        'zmk-config/CHOCO-FACTORY.md',
      ]),
    );
    const build = await zip.file('zmk-config/build.yaml')!.async('string');
    expect(build).toContain('snippet: studio-rpc-usb-uart');
    const keymap = await zip.file('zmk-config/config/Choco-Key.keymap')!.async('string');
    expect(parseKeymap(keymap).layers[0].bindings[0].text).toBe('&kp A');
    const dtsi = await zip.file('zmk-config/config/boards/shields/Choco-Key/Choco-Key.dtsi')!.async('string');
    expect(dtsi).toContain('zmk,physical-layout = &default_layout;');
  });
  it('元の構成: build.yaml / dtsi は元のまま', async () => {
    const p = createProject(chocoKey, 'test');
    const { blob } = await buildZip(p, chocoKey, 'original');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file('zmk-config/build.yaml')!.async('string')).toBe(chocoKey.files.original['build.yaml']);
    expect(await zip.file('zmk-config/config/boards/shields/Choco-Key/Choco-Key.dtsi')!.async('string')).toBe(
      chocoKey.files.original['config/boards/shields/Choco-Key/Choco-Key.dtsi'],
    );
  });
});

describe('プロジェクト・保存', () => {
  it('元の .keymap をインポートできる / キー数が違うとエラー', () => {
    const p = projectFromKeymapFile(chocoKey, 'orig', chocoKey.files.original['config/Choco-Key.keymap']);
    // 5 レイヤーのキーマップは各 OS にコピーされて 25 レイヤーになる
    expect(p.layers).toHaveLength(25);
    expect(p.layers[20].bindings[41]).toEqual({ b: 'lt', p: [24, 0x070029] });
    const broken = chocoKey.files.original['config/Choco-Key.keymap'].replace('&kp Q ', '');
    expect(() => projectFromKeymapFile(chocoKey, 'x', broken)).toThrow(/キー数/);
  });
  it('IndexedDB に保存・バックアップ・復元 (同じ ID は上書きしない)', async () => {
    const a = createProject(chocoKey, 'A');
    await putProject(a);
    const backup = await createBackup();
    expect(backup.projects.map((x) => x.name)).toContain('A');
    const n = await restoreBackup(backup, () => 'new-id');
    expect(n).toBe(backup.projects.length);
    const all = await listProjects();
    expect(all.find((x) => x.id === 'new-id')?.name).toBe('A (復元)');
    expect(all.find((x) => x.id === a.id)?.name).toBe('A');
  });
});
