import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { chocoKey } from '../keyboards/choco-key';
import { buildZip } from '../lib/files';
import { createProject } from '../model/project';
import { keycodeByName } from '../zmk/keycodes';

// ZMK 実ビルド検証用の ZIP を出力 (通常のテスト実行では OUT_DIR が無いのでスキップ)
it.skipIf(!process.env.OUT_DIR)('gen', async () => {
  const p = createProject(chocoKey, 'build-test');
  const K = (n: string) => keycodeByName(n)!.value;
  p.layers[0].bindings[0] = { b: 'mt', p: [K('LSHFT'), K('Q')] };
  p.layers[1].bindings[5] = { b: 'mo', p: [5] };
  p.layers[1].bindings[6] = { b: 'hello', p: [] };
  p.layers[2].name = 'Num';
  p.layers.push({ id: 5, name: 'Mouse', bindings: p.layers[0].bindings.map(() => ({ b: 'trans', p: [] })) });
  p.layers[5].bindings[0] = { b: 'mkp', p: [1] };
  p.layers[5].bindings[1] = { b: 'bt', p: [3, 2] };
  p.macros.push({ label: 'hello', name: 'Hello', keys: [K('H'), K('I')], waitMs: 30, tapMs: 30 });
  for (const v of ['studio', 'original'] as const) {
    const { blob, warnings } = await buildZip(p, chocoKey, v);
    writeFileSync(`${process.env.OUT_DIR}/${v}.zip`, Buffer.from(await blob.arrayBuffer()));
    console.log(v, warnings);
  }
});
