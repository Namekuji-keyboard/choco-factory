import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Undo2, Redo2, History, RotateCcw, Check, Loader2, CircleAlert, Upload, HardDrive } from 'lucide-react';
import { useEditor } from '../state/editor';
import { useDevice, useDeviceDiff } from '../state/device';

export function Footer({ onApply, onConnectHelp }: { onApply: () => void; onConnectHelp: () => void }) {
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const jumpTo = useEditor((s) => s.jumpTo);
  const resetToDefault = useEditor((s) => s.resetToDefault);
  const saveStatus = useEditor((s) => s.saveStatus);
  const dev = useDevice((s) => s.dev);
  const status = useDevice((s) => s.status);
  const progress = useDevice((s) => s.progress);
  const diff = useDeviceDiff();
  const [hist, setHist] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hist) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setHist(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [hist]);

  const save = {
    saved: { icon: <Check size={14} />, text: 'ブラウザに保存済み', cls: 'text-ok' },
    saving: { icon: <Loader2 size={14} className="animate-spin" />, text: '保存中…', cls: 'text-muted' },
    unsaved: { icon: <HardDrive size={14} />, text: '未保存の変更', cls: 'text-warn' },
    error: { icon: <CircleAlert size={14} />, text: '保存に失敗', cls: 'text-danger' },
  }[saveStatus];

  const writing = status === 'writing';

  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-3 py-2 sm:px-4">
      <div className="flex items-center gap-1">
        <button className="btn-ghost p-2" onClick={undo} disabled={!past.length} title="元に戻す (Ctrl+Z)">
          <Undo2 size={17} />
        </button>
        <button className="btn-ghost p-2" onClick={redo} disabled={!future.length} title="やり直し (Ctrl+Y)">
          <Redo2 size={17} />
        </button>
        <div className="relative" ref={ref}>
          <button className="btn-ghost p-2" onClick={() => setHist(!hist)} disabled={!past.length && !future.length} title="編集履歴">
            <History size={17} />
          </button>
          {hist && (
            <div className="panel animate-pop absolute bottom-full left-0 z-30 mb-1 w-72 p-1 shadow-xl">
              <div className="px-2.5 py-1.5 text-xs font-semibold text-muted">編集履歴 (クリックでその操作の前に戻る)</div>
              <div className="scroll-thin max-h-72 overflow-y-auto">
                {[...future].reverse().map((h, i) => (
                  <div key={`f${i}`} className="flex items-center justify-between rounded-md px-2.5 py-1 text-sm text-muted/60 line-through">
                    <span className="truncate">{h.label}</span>
                  </div>
                ))}
                {[...past].reverse().map((h, ri) => {
                  const i = past.length - 1 - ri;
                  return (
                    <button key={i} className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1 text-left text-sm hover:bg-surface-2" onClick={() => (jumpTo(i), setHist(false))}>
                      <span className="truncate">{h.label}</span>
                      <span className="shrink-0 text-[11px] text-muted">{new Date(h.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <button
          className="btn-ghost"
          onClick={() => confirm('このプロジェクトのキーマップを初期状態 (読み込んだキーマップファイルの内容) に戻しますか？\n「元に戻す」で取り消せます。') && resetToDefault()}
          title="初期状態に戻す"
        >
          <RotateCcw size={15} />
          <span className="hidden sm:inline">初期状態に戻す</span>
        </button>
      </div>

      <div className={clsx('flex items-center gap-1.5 text-xs font-medium', save.cls)} title="編集内容はこのブラウザ (IndexedDB) に自動保存されます">
        {save.icon}
        {save.text}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {writing && progress ? (
          <div className="flex w-56 flex-col gap-1">
            <div className="truncate text-xs text-muted">{progress.message}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
            </div>
          </div>
        ) : dev && diff !== null ? (
          <span className={clsx('text-xs', diff ? 'font-medium text-accent' : 'text-muted')}>{diff ? `キーボードに未適用の変更: ${diff} 件` : 'キーボードと同じ内容です'}</span>
        ) : (
          <button className="text-xs text-muted underline-offset-2 hover:underline" onClick={onConnectHelp}>
            キーボード未接続
          </button>
        )}
        <button className="btn-primary px-4 py-2" onClick={onApply} disabled={writing || (!!dev && diff === 0 && status !== 'error')}>
          {writing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          キーボードに適用
        </button>
      </div>
    </footer>
  );
}
