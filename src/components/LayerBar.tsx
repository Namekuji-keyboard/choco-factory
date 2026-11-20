import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Plus, MoreHorizontal, Copy, Eraser, Trash2, Pencil } from 'lucide-react';
import { useEditor } from '../state/editor';
import { useDevice } from '../state/device';

export function LayerBar() {
  const project = useEditor((s) => s.project);
  const layerIndex = useEditor((s) => s.layerIndex);
  const setLayerIndex = useEditor((s) => s.setLayerIndex);
  const renameLayer = useEditor((s) => s.renameLayer);
  const addLayer = useEditor((s) => s.addLayer);
  const removeLayer = useEditor((s) => s.removeLayer);
  const clearLayer = useEditor((s) => s.clearLayer);
  const deviceLayers = useDevice((s) => s.deviceLayers);
  const available = useDevice((s) => s.availableLayers);
  const [editing, setEditing] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  if (!project) return null;
  const maxLayers = deviceLayers ? deviceLayers.length + available : undefined;
  const canAdd = maxLayers === undefined || project.layers.length < maxLayers;

  return (
    <div className="flex items-center gap-2">
      <div className="scroll-thin flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
        {project.layers.map((l, i) => (
          <div key={`${l.id}-${i}`} className="shrink-0">
            {editing === i ? (
              <input
                autoFocus
                className="input h-8 w-36 py-0"
                defaultValue={l.name}
                maxLength={20}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== l.name) renameLayer(i, v);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <button
                onClick={() => setLayerIndex(i)}
                onDoubleClick={() => setEditing(i)}
                title="ダブルクリックで名前を変更"
                className={clsx(
                  'flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-all',
                  i === layerIndex ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
                )}
              >
                <span className={clsx('flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-bold', i === layerIndex ? 'bg-accent text-accent-fg' : 'bg-line/70')}>{i}</span>
                {l.name}
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="btn-outline h-9 px-2.5" onClick={() => addLayer()} disabled={!canAdd} title={canAdd ? 'レイヤーを追加' : `キーボードのファームウェアの上限 (${maxLayers}) に達しています`}>
        <Plus size={16} />
      </button>
      <div className="relative" ref={menuRef}>
        <button className="btn-outline h-9 px-2.5" onClick={() => setMenu(!menu)} aria-label="レイヤーの操作">
          <MoreHorizontal size={16} />
        </button>
        {menu && (
          <div className="panel animate-pop absolute top-full right-0 z-30 mt-1 w-56 p-1 shadow-xl">
            <MenuItem icon={<Pencil size={14} />} onClick={() => (setEditing(layerIndex), setMenu(false))}>
              名前を変更
            </MenuItem>
            <MenuItem icon={<Copy size={14} />} disabled={!canAdd} onClick={() => (addLayer(layerIndex), setMenu(false))}>
              このレイヤーを複製
            </MenuItem>
            <MenuItem icon={<Eraser size={14} />} onClick={() => (confirm('このレイヤーのすべてのキーを透過 (▽) にしますか？') && clearLayer(layerIndex), setMenu(false))}>
              すべて透過にする
            </MenuItem>
            <MenuItem
              icon={<Trash2 size={14} />}
              danger
              disabled={project.layers.length <= 1}
              onClick={() => (confirm(`「${project.layers[layerIndex].name}」を削除しますか？`) && removeLayer(layerIndex), setMenu(false))}
            >
              このレイヤーを削除
            </MenuItem>
          </div>
        )}
      </div>
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger, disabled }: { icon?: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={clsx('flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-40', danger && 'text-danger')}
    >
      {icon}
      {children}
    </button>
  );
}
