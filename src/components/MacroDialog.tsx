import { useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from './ui';
import { useEditor } from '../state/editor';
import { useRegistry } from '../state/device';
import type { MacroDef } from '../model/types';
import { KEYCODES, keycodeLabel, keycodeSearchText } from '../zmk/keycodes';

/** マクロ (キーを順番にタップする) の作成・編集。ファイル出力専用 */
export function MacroDialog({ macro, onClose }: { macro: MacroDef | null; onClose: () => void }) {
  const save = useEditor((s) => s.saveMacro);
  const host = useEditor((s) => s.settings.hostLayout);
  const registry = useRegistry();
  const [name, setName] = useState(macro?.name ?? '');
  const [label, setLabel] = useState(macro?.label ?? '');
  const [keys, setKeys] = useState<number[]>(macro?.keys ?? []);
  const [waitMs, setWaitMs] = useState(macro?.waitMs ?? 30);
  const [tapMs, setTapMs] = useState(macro?.tapMs ?? 30);
  const [q, setQ] = useState('');
  const [text, setText] = useState('');

  const autoLabel = (n: string) => 'm_' + n.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  const effLabel = label || autoLabel(name || 'macro');
  const labelError = !/^[a-z_][a-z0-9_]*$/.test(effLabel)
    ? 'ラベルは英小文字・数字・_ のみ (先頭は英字か _)'
    : effLabel !== macro?.label && registry.has(effLabel)
      ? 'このラベルは既に使われています'
      : null;

  const results = q.trim() ? KEYCODES.filter((k) => keycodeSearchText(k).includes(q.trim().toLowerCase())).slice(0, 40) : [];

  /** 英数字の文字列をキーコード列に変換 (US 配列基準) */
  const addText = () => {
    const out: number[] = [];
    for (const ch of text) {
      const up = ch.toUpperCase();
      const name = /[A-Z]/.test(up) ? up : /[0-9]/.test(ch) ? `N${ch}` : ch === ' ' ? 'SPACE' : ch === '\n' ? 'RET' : null;
      const k = name ? KEYCODES.find((x) => x.names.includes(name)) : undefined;
      if (!k) continue;
      out.push(/[A-Z]/.test(ch) ? (0x02 << 24 | k.value) >>> 0 : k.value);
    }
    setKeys([...keys, ...out]);
    setText('');
  };

  const ok = name.trim() && keys.length && !labelError;
  return (
    <Modal
      open
      onClose={onClose}
      title={macro ? 'マクロを編集' : 'マクロを作成'}
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn-primary"
            disabled={!ok}
            onClick={() => {
              save({ label: effLabel, name: name.trim(), keys, waitMs, tapMs }, macro?.label);
              onClose();
            }}
          >
            保存
          </button>
        </>
      }
    >
      <p className="mb-4 rounded-lg bg-warn/10 p-2 text-xs text-warn">
        マクロはファームウェアに組み込む必要があるため、キーボードへの「適用」では書き込めません。「ファイル」→「ZMK 設定一式 (ZIP)」で出力し、ファームウェアをビルド・書き込みしてください。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">名前</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: メールアドレス" />
        </div>
        <div>
          <label className="label">ラベル (キーマップ内の名前)</label>
          <input className="input font-mono" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={effLabel} />
          {labelError && <p className="mt-1 text-xs text-danger">{labelError}</p>}
        </div>
        <div>
          <label className="label">キー間の待ち時間 (ms)</label>
          <input className="input" type="number" min={0} value={waitMs} onChange={(e) => setWaitMs(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">キーを押す時間 (ms)</label>
          <input className="input" type="number" min={0} value={tapMs} onChange={(e) => setTapMs(Number(e.target.value))} />
        </div>
      </div>
      <div className="mt-4">
        <label className="label">キーの並び ({keys.length})</label>
        <div className="flex min-h-12 flex-wrap gap-1 rounded-lg border border-line bg-surface-2 p-2">
          {keys.map((k, i) => (
            <span key={i} className="chip gap-1">
              {keycodeLabel(k, host)}
              <button onClick={() => setKeys(keys.filter((_, j) => j !== i))} aria-label="削除">
                <X size={11} />
              </button>
            </span>
          ))}
          {!keys.length && <span className="text-xs text-muted">下からキーを追加してください</span>}
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">文字列から追加 (英数字・スペース)</label>
          <div className="flex gap-2">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="hello world" />
            <button className="btn-outline" onClick={addText} disabled={!text}>
              追加
            </button>
          </div>
        </div>
        <div>
          <label className="label">キーコードを検索して追加</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="enter, tab, ctrl…" />
          <div className="mt-1 flex flex-wrap gap-1">
            {results.map((k) => (
              <button key={k.value} className="chip" onClick={() => setKeys([...keys, k.value])} title={k.names.join(' / ')}>
                {keycodeLabel(k.value, host)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
