import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Usb } from 'lucide-react';
import { useEditor, scrollValFor } from '../state/editor';
import { useDevice, useRegistry } from '../state/device';
import { describeBinding, TONE_CLASSES, type DisplayContext } from '../lib/display';
import { bindingsEqual, parseKeymap } from '../zmk/keymap';
import type { KeyLayout } from '../model/types';

const GAP = 0.08; // キー同士の隙間 (1u に対する割合)

export function KeyboardView() {
  const project = useEditor((s) => s.project);
  const kb = useEditor((s) => s.keyboard);
  const layerIndex = useEditor((s) => s.layerIndex);
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  const host = useEditor((s) => s.settings.hostLayout);
  const deviceLayers = useDevice((s) => s.deviceLayers);
  const registry = useRegistry();
  const physical = kb.keys;

  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const bounds = useMemo(() => {
    const maxX = Math.max(...physical.map((k) => k.x + k.w));
    const maxY = Math.max(...physical.map((k) => k.y + k.h));
    return { maxX, maxY };
  }, [physical]);
  const unit = Math.max(22, Math.min(70, (width - 4) / bounds.maxX));

  const layer = project?.layers[layerIndex];
  const ctx: DisplayContext = useMemo(
    () => ({ behaviors: registry, layers: project?.layers ?? [], host, scrollVal: project ? scrollValFor(project.keymapSource) : 10 }),
    [registry, project, host],
  );
  const sensorBindings = useMemo(() => {
    if (!project) return [] as string[];
    try {
      const parsed = parseKeymap(project.keymapSource);
      const src = parsed.layers[layerIndex]?.sensorBindings ?? '';
      return src.split(',').map((s) => s.replace(/[<>]/g, '').trim());
    } catch {
      return [];
    }
  }, [project, layerIndex]);

  if (!project || !layer) return null;
  const devLayer = deviceLayers?.[layerIndex];
  const centralSide = kb.central;
  const leftMax = Math.max(...physical.filter((k) => k.side === 'L').map((k) => k.x + k.w), 0);
  const rightMin = Math.min(...physical.filter((k) => k.side === 'R').map((k) => k.x), bounds.maxX);

  const onKey = (pos: number, e: React.MouseEvent) => {
    select(pos, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single');
  };

  return (
    <div ref={wrap} className="w-full select-none">
      <div className="relative mx-auto" style={{ width: bounds.maxX * unit, height: bounds.maxY * unit + 26 }}>
        {/* 左右のラベル */}
        {(['L', 'R'] as const).map((side) => {
          const x0 = side === 'L' ? 0 : rightMin * unit;
          const x1 = side === 'L' ? leftMax * unit : bounds.maxX * unit;
          const central = centralSide === side;
          return (
            <div key={side} className="absolute top-0 flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted" style={{ left: x0, width: x1 - x0, height: 20 }}>
              <span>{side === 'L' ? '左手' : '右手'}</span>
              {central ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-px text-[10px] text-accent" title="ZMK Studio はこちら側を USB 接続して使います">
                  <Usb size={10} /> セントラル
                </span>
              ) : (
                <span className="rounded-full bg-surface-2 px-1.5 py-px text-[10px]">ペリフェラル</span>
              )}
            </div>
          );
        })}
        <div className="absolute inset-x-0 top-[26px]">
          {physical.map((k, pos) => {
            const b = layer.bindings[pos];
            if (!b) return null;
            const d = describeBinding(b, ctx);
            const changed = devLayer ? !devLayer.bindings[pos] || !bindingsEqual(b, devLayer.bindings[pos]) : false;
            return (
              <Keycap
                key={pos}
                k={k}
                unit={unit}
                selected={selected.includes(pos)}
                changed={changed}
                onClick={(e) => onKey(pos, e)}
                main={d.main}
                hold={d.hold}
                tag={d.tag}
                tone={TONE_CLASSES[d.tone]}
                title={`#${pos + 1} ${d.title}${changed ? '\n(キーボードに未適用)' : ''}`}
              />
            );
          })}
          {kb.encoders?.map((enc) => (
            <div
              key={enc.sensorIndex}
              className="absolute flex items-center justify-center rounded-full border border-line bg-surface-2 text-muted shadow-inner"
              style={{ left: (enc.x - 0.3) * unit, top: (enc.y - 0.3) * unit, width: unit * 0.6, height: unit * 0.6 }}
              title={`${enc.name}: ${sensorBindings[enc.sensorIndex] ?? '(なし)'}\nエンコーダーの割り当ては ZMK Studio では変更できません (キーマップファイルで設定)`}
            >
              <div className="h-[55%] w-[55%] rounded-full border-2 border-dashed border-muted/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Keycap({
  k,
  unit,
  selected,
  changed,
  onClick,
  main,
  hold,
  tag,
  tone,
  title,
}: {
  k: KeyLayout;
  unit: number;
  selected: boolean;
  changed: boolean;
  onClick: (e: React.MouseEvent) => void;
  main: string;
  hold?: string;
  tag?: string;
  tone: string;
  title: string;
}) {
  const g = unit * GAP;
  const w = k.w * unit - g;
  const h = k.h * unit - g;
  const len = [...main].length;
  const size = len <= 1 ? 0.34 : len <= 3 ? 0.26 : len <= 5 ? 0.2 : len <= 8 ? 0.16 : 0.13;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-selected={selected}
      data-changed={changed}
      className="keycap absolute flex flex-col items-center justify-center overflow-hidden rounded-[22%] px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{
        left: k.x * unit + g / 2,
        top: k.y * unit + g / 2,
        width: w,
        height: h,
        transform: k.r ? `rotate(${k.r}deg)` : undefined,
        transformOrigin: k.r ? `${((k.rx ?? k.x) - k.x) * unit}px ${((k.ry ?? k.y) - k.y) * unit}px` : undefined,
      }}
    >
      {tag && (
        <span className="absolute top-[6%] left-[9%] text-[max(8px,0.13em)] leading-none font-semibold text-muted" style={{ fontSize: Math.max(8, unit * 0.13) }}>
          {tag}
        </span>
      )}
      <span className={clsx('max-w-full truncate leading-tight font-semibold', tone)} style={{ fontSize: Math.max(10, unit * size) }}>
        {main}
      </span>
      {hold && (
        <span className="mt-0.5 max-w-full truncate leading-none text-muted" style={{ fontSize: Math.max(8, unit * 0.14) }}>
          {hold}
        </span>
      )}
    </button>
  );
}
