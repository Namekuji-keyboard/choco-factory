import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { MoreHorizontal, Copy, Eraser, Pencil, Keyboard, Combine, AlertTriangle } from 'lucide-react';
import { useEditor } from '../state/editor';
import { OS_LIST, absLayer, splitLayerIndex, transparentOnDefault } from '../model/os';
import { MenuItem } from './LayerBar';

/**
 * OS 選択 → その OS のデフォルトレイヤー → Layer 0〜4 の選択
 */
export function OsBar({ onShortcuts, onCombos }: { onShortcuts: () => void; onCombos: () => void }) {
  const project = useEditor((s) => s.project);
  const layerIndex = useEditor((s) => s.layerIndex);
  const setLayerIndex = useEditor((s) => s.setLayerIndex);
  const setOs = useEditor((s) => s.setOs);
  const setOsDefault = useEditor((s) => s.setOsDefault);
  const renameLayer = useEditor((s) => s.renameLayer);
  const clearLayer = useEditor((s) => s.clearLayer);
  const copyOs = useEditor((s) => s.copyOs);
  const copyLayer = useEditor((s) => s.copyLayer);
  const [editing, setEditing] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  if (!project?.os) return null;
  const os = project.os;
  const cur = splitLayerIndex(os, layerIndex);
  const info = OS_LIST[cur.os];
  const def = os.systems[cur.os].defaultLayer;
  const transCount = transparentOnDefault(project.layers, os, cur.os);

  return (
    <div className="space-y-2">
      {/* OS 選択 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="scroll-thin flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1" role="tablist" aria-label="OS">
          {OS_LIST.map((o, i) => (
            <button
              key={o.id}
              role="tab"
              aria-selected={i === cur.os}
              onClick={() => setOs(i)}
              className={clsx(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-all',
                i === cur.os ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:bg-surface hover:text-fg',
              )}
              title={`${o.name} (Bluetooth プロファイル ${o.profile})`}
            >
              {o.name}
              <span className={clsx('rounded px-1 text-[10px] font-medium', i === cur.os ? 'bg-black/15' : 'bg-line/60')}>BT{o.profile}</span>
            </button>
          ))}
        </div>
        <button className="btn-outline h-9" onClick={onShortcuts} title="ショートカットの登録・管理">
          <Keyboard size={15} /> <span className="hidden sm:inline">ショートカット</span>
        </button>
        <button className="btn-outline h-9" onClick={onCombos} title="コンボ (同時押し) の設定">
          <Combine size={15} /> <span className="hidden sm:inline">コンボ</span>
        </button>
      </div>

      {/* デフォルトレイヤー + レイヤー選択 */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="whitespace-nowrap">{info.name} のデフォルトレイヤー</span>
          <select className="input h-9 w-auto py-0" value={def} onChange={(e) => setOsDefault(cur.os, Number(e.target.value))} title="OS 切替キーを押したときに有効になるレイヤー">
            {Array.from({ length: os.layersPerOs }, (_, j) => (
              <option key={j} value={j}>
                Layer {j}
              </option>
            ))}
          </select>
        </label>
        <div className="scroll-thin flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
          {Array.from({ length: os.layersPerOs }, (_, j) => {
            const idx = absLayer(os, cur.os, j);
            const l = project.layers[idx];
            const active = idx === layerIndex;
            return editing === idx ? (
              <input
                key={idx}
                autoFocus
                className="input h-8 w-36 py-0"
                defaultValue={l.name}
                maxLength={20}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== l.name) renameLayer(idx, v);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <button
                key={idx}
                onClick={() => setLayerIndex(idx)}
                onDoubleClick={() => setEditing(idx)}
                title={`ZMK のレイヤー ${idx}「${l.name}」(ダブルクリックで名前を変更)`}
                className={clsx(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-all',
                  active ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
                )}
              >
                <span className={clsx('flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-bold', active ? 'bg-accent text-accent-fg' : 'bg-line/70')}>{j}</span>
                Layer {j}
                {j === def && <span className="rounded bg-ok/20 px-1 text-[10px] text-ok">既定</span>}
              </button>
            );
          })}
        </div>
        <div className="relative" ref={menuRef}>
          <button className="btn-outline h-9 px-2.5" onClick={() => setMenu(!menu)} aria-label="レイヤーの操作">
            <MoreHorizontal size={16} />
          </button>
          {menu && (
            <div className="panel animate-pop absolute top-full right-0 z-30 mt-1 w-72 p-1 shadow-xl">
              <MenuItem icon={<Pencil size={14} />} onClick={() => (setEditing(layerIndex), setMenu(false))}>
                レイヤー名を変更
              </MenuItem>
              <MenuItem icon={<Eraser size={14} />} onClick={() => (confirm('このレイヤーのすべてのキーを透過 (▽) にしますか？') && clearLayer(layerIndex), setMenu(false))}>
                このレイヤーをすべて透過にする
              </MenuItem>
              <div className="my-1 border-t border-line" />
              <div className="px-2.5 pt-1 pb-0.5 text-[11px] text-muted">このレイヤーに別のレイヤーの内容をコピー</div>
              <select
                className="input mx-1 my-1 w-[calc(100%-0.5rem)]"
                value=""
                onChange={(e) => {
                  const from = Number(e.target.value);
                  if (confirm(`「${project.layers[from].name}」の内容で、表示中のレイヤーを上書きしますか？`)) copyLayer(from, layerIndex);
                  setMenu(false);
                }}
              >
                <option value="">コピー元を選択…</option>
                {OS_LIST.map((o, oi) => (
                  <optgroup key={o.id} label={o.name}>
                    {Array.from({ length: os.layersPerOs }, (_, j) => absLayer(os, oi, j))
                      .filter((i) => i !== layerIndex)
                      .map((i) => (
                        <option key={i} value={i}>
                          {o.name} Layer {splitLayerIndex(os, i).layer}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <div className="px-2.5 pt-1 pb-0.5 text-[11px] text-muted">{info.name} の全レイヤー (0〜4) を別の OS からコピー</div>
              {OS_LIST.map((o, oi) =>
                oi === cur.os ? null : (
                  <MenuItem
                    key={o.id}
                    icon={<Copy size={14} />}
                    onClick={() => (confirm(`${o.name} の Layer 0〜4 の内容で、${info.name} の Layer 0〜4 を上書きしますか？`) && copyOs(oi, cur.os), setMenu(false))}
                  >
                    {o.name} からコピー
                  </MenuItem>
                ),
              )}
            </div>
          )}
        </div>
      </div>
      {transCount > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs text-warn">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          {info.name} のデフォルトレイヤー (Layer {def}) に透過 (▽) のキーが {transCount} 個あります。ZMK ではレイヤー 0 (Windows Layer 0) が常に有効なため、OS 切替後にこれらのキーは Windows Layer 0 の割り当てになります。
        </p>
      )}
    </div>
  );
}
