import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { MoreHorizontal, Copy, Eraser, Pencil, Keyboard, Combine, AlertTriangle } from 'lucide-react';
import { useEditor } from '../state/editor';
import { OS_LIST, absLayer, groupName, groupOs, splitLayerIndex, transparentOnDefault } from '../model/os';
import type { OsId } from '../model/types';
import { useRegistry } from '../state/device';
import { bindingOsProblems } from '../zmk/keycodes.os';
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
  const setGroupOs = useEditor((s) => s.setGroupOs);
  const kb = useEditor((s) => s.keyboard);
  const host = useEditor((s) => s.settings.hostLayout);
  const registry = useRegistry();
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
  const info = { name: groupName(os, cur.os) };
  const curOs = groupOs(os, cur.os);
  // 選択中の OS で動作しないキー (ZMK 公式のキーコード一覧による)。削除はせず警告だけ出す
  const problems = Array.from({ length: os.layersPerOs }, (_, j) => absLayer(os, cur.os, j)).flatMap((li) =>
    project.layers[li].bindings.flatMap((b, pos) => bindingOsProblems(b, curOs.id, registry, host).map((k) => ({ layer: li % os.layersPerOs, pos, k }))),
  );
  const def = os.systems[cur.os].defaultLayer;
  const transCount = transparentOnDefault(project.layers, os, cur.os, kb.keys.length);

  return (
    <div className="space-y-2">
      {/* OS 選択 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="scroll-thin flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1" role="tablist" aria-label="OS">
          {os.systems.map((sys, i) => {
            const active = i === cur.os;
            return (
              <div
                key={i}
                className={clsx('flex h-10 shrink-0 items-center gap-1 rounded-lg pr-1 pl-3 transition-all', active ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:bg-surface hover:text-fg')}
              >
                <button role="tab" aria-selected={active} onClick={() => setOs(i)} className="text-sm font-semibold whitespace-nowrap" title={`Bluetooth プロファイル ${i + 1} (ZMK の BT_SEL ${i})`}>
                  Bluetooth {i + 1}
                </button>
                <select
                  aria-label={`Bluetooth ${i + 1} の OS`}
                  className={clsx('h-7 rounded-md border-0 py-0 pr-6 pl-1.5 text-xs font-medium', active ? 'bg-black/15 text-accent-fg' : 'bg-line/60 text-fg')}
                  value={sys.id}
                  onChange={(e) => {
                    setGroupOs(i, e.target.value as OsId);
                    setOs(i);
                  }}
                >
                  {OS_LIST.map((x) => (
                    <option key={x.id} value={x.id} className="text-fg">
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
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
                {os.systems.map((_, oi) => (
                  <optgroup key={oi} label={groupName(os, oi)}>
                    {Array.from({ length: os.layersPerOs }, (_, j) => absLayer(os, oi, j))
                      .filter((i) => i !== layerIndex)
                      .map((i) => (
                        <option key={i} value={i}>
                          {groupName(os, oi)} Layer {splitLayerIndex(os, i).layer}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <div className="px-2.5 pt-1 pb-0.5 text-[11px] text-muted">{info.name} の全レイヤー (0〜4) を別の Bluetooth プロファイルからコピー</div>
              {os.systems.map((_, oi) =>
                oi === cur.os ? null : (
                  <MenuItem
                    key={oi}
                    icon={<Copy size={14} />}
                    onClick={() => (confirm(`${groupName(os, oi)} の Layer 0〜4 の内容で、${info.name} の Layer 0〜4 を上書きしますか？`) && copyOs(oi, cur.os), setMenu(false))}
                  >
                    {groupName(os, oi)} からコピー
                  </MenuItem>
                ),
              )}
            </div>
          )}
        </div>
      </div>
      {problems.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          {curOs.name} で動作しないキーが {problems.length} 個あります (ZMK 公式のキーコード一覧による):{' '}
          {problems
            .slice(0, 6)
            .map((p) => `Layer ${p.layer} の #${p.pos + 1} (${p.k})`)
            .join('、')}
          {problems.length > 6 ? ' ほか' : ''}。割り当ては削除していません。
        </p>
      )}
      {transCount > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs text-warn">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          {info.name} のデフォルトレイヤー (Layer {def}) に透過 (▽) のキーが {transCount} 個あります。ZMK ではレイヤー 0 (Bluetooth 1 の Layer 0) が常に有効なため、OS 切替後にこれらのキーは Bluetooth 1 の Layer 0 の割り当てになります。
        </p>
      )}
    </div>
  );
}
