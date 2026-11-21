import { useMemo } from 'react';
import clsx from 'clsx';
import { ClipboardCopy, ClipboardPaste, MousePointerClick, Ban, ArrowDownToLine, Copy } from 'lucide-react';
import { useEditor, scrollValFor } from '../state/editor';
import { useDevice, useRegistry } from '../state/device';
import type { Binding } from '../model/types';
import {
  BEHAVIOR_GROUP_LABELS,
  BL_COMMANDS,
  BT_COMMANDS,
  EP_COMMANDS,
  MOUSE_BUTTONS,
  MOUSE_MOVES,
  OUT_COMMANDS,
  RGB_COMMANDS,
  mouseScrolls,
  type BehaviorDef,
  type BehaviorGroup,
  type NamedValue,
  type ParamKind,
} from '../zmk/behaviors';
import { MOD_FUNCS, MODIFIER_KEYCODES, applyMods, keycodeByName, keycodeLabel, modsOf, stripMods } from '../zmk/keycodes';
import { formatBinding } from '../zmk/keymap';
import { Kbd } from './ui';
import { OS_LIST, absLayer, osDefaultIndex, splitLayerIndex } from '../model/os';
import type { OsLayout } from '../model/types';

/** ビヘイビアを切り替えたときの初期パラメータ */
function defaultParams(def: BehaviorDef, prev: Binding, layerIds: number[]): number[] {
  const prevKey = prev.b === 'kp' || prev.b === 'sk' || prev.b === 'kt' ? prev.p[0] : prev.b === 'mt' || prev.b === 'lt' ? prev.p[1] : undefined;
  const fallbackKey = prevKey ?? keycodeByName('A')!.value;
  return def.params.map((k, i) => {
    switch (k) {
      case 'keycode':
        return fallbackKey;
      case 'modifier':
        return keycodeByName('LSHFT')!.value;
      case 'layer':
        return layerIds[1] ?? layerIds[0] ?? 0;
      case 'bt_arg':
        return 0;
      case 'bt_cmd':
        return 3;
      case 'mouse_button':
        return 1;
      case 'mouse_move':
        return MOUSE_MOVES[0].value;
      case 'mouse_scroll':
        return 0;
      default:
        return i === 0 ? 0 : 0;
    }
  });
}

export function KeyPanel() {
  const project = useEditor((s) => s.project);
  const kb = useEditor((s) => s.keyboard);
  const layerIndex = useEditor((s) => s.layerIndex);
  const selected = useEditor((s) => s.selected);
  const assign = useEditor((s) => s.assign);
  const copy = useEditor((s) => s.copy);
  const paste = useEditor((s) => s.paste);
  const clipboard = useEditor((s) => s.clipboard);
  const host = useEditor((s) => s.settings.hostLayout);
  const map = useDevice((s) => s.map);
  const registry = useRegistry();

  const groups = useMemo(() => {
    const g = new Map<BehaviorGroup, BehaviorDef[]>();
    for (const def of registry.values()) {
      if (!g.has(def.group)) g.set(def.group, []);
      g.get(def.group)!.push(def);
    }
    return g;
  }, [registry]);

  if (!project) return null;
  const layer = project.layers[layerIndex];
  if (!selected.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-6 text-center text-sm text-muted">
        <MousePointerClick size={32} className="text-accent" />
        <p className="font-medium text-fg">キーをクリックして選択</p>
        <p>
          選択したキーの割り当てをここで設定します。下のキーコード一覧をクリックすると、選択中のキーにすぐ割り当てられます。
        </p>
        <ul className="mt-2 space-y-1 text-left text-xs">
          <li>
            <Kbd>Shift</Kbd> + クリック: 範囲選択
          </li>
          <li>
            <Kbd>Ctrl</Kbd> + クリック: 複数選択
          </li>
          <li>
            <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd> / <Kbd>Ctrl</Kbd>+<Kbd>V</Kbd>: コピー / 貼り付け
          </li>
          <li>
            <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> / <Kbd>Ctrl</Kbd>+<Kbd>Y</Kbd>: 元に戻す / やり直し
          </li>
          <li>
            <Kbd>Delete</Kbd>: 透過 (▽) にする
          </li>
        </ul>
      </div>
    );
  }

  const primaryPos = selected[selected.length - 1];
  const binding = layer.bindings[primaryPos];
  const def = registry.get(binding.b);
  const k = kb.keys[primaryPos];
  const multi = selected.length > 1;
  const os = project.os;
  const curOs = os ? splitLayerIndex(os, layerIndex).os : 0;
  // OS 別キーマップでは、新しく割り当てるレイヤー操作は表示中の OS 内のレイヤーを指す
  const layerIds = os ? Array.from({ length: os.layersPerOs }, (_, j) => project.layers[absLayer(os, curOs, j)].id) : project.layers.map((l) => l.id);
  const notOnDevice = map && !map.byLabel.has(binding.b) && !binding.b.startsWith('__device_');

  const update = (next: Binding, label: string) => assign(next, label);
  const setParam = (i: number, v: number) => {
    const p = [...binding.p];
    p[i] = v >>> 0;
    update({ b: binding.b, p }, `キー #${primaryPos + 1} の設定を変更`);
  };
  const changeBehavior = (label: string) => {
    const nd = registry.get(label);
    if (!nd || label === binding.b) return;
    const params = label === 'os_sel' && os ? [OS_LIST[curOs].profile, osDefaultIndex(os, curOs)] : label === 'os_to' && os ? [osDefaultIndex(os, curOs)] : defaultParams(nd, binding, layerIds);
    update({ b: label, p: params }, `${nd.nameJa} に変更`);
  };

  const code = formatBinding(binding, { behaviors: registry, layerIndexById: new Map(project.layers.map((l, i) => [l.id, i])), scrollVal: scrollValFor(project.keymapSource) });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{multi ? `${selected.length} 個のキーを選択中` : `キー #${primaryPos + 1}`}</div>
            <div className="text-xs text-muted">
              {os ? `${OS_LIST[curOs].name} / Layer ${splitLayerIndex(os, layerIndex).layer}` : layer.name} ・ {k.side === 'L' ? '左手' : '右手'}
              {k.row !== undefined ? ` ${k.row + 1} 行目` : ''}
              {multi ? ' (最後に選んだキーを表示)' : ''}
            </div>
          </div>
          <div className="flex gap-1">
            <button className="btn-ghost p-1.5" title="コピー (Ctrl+C)" onClick={copy}>
              <ClipboardCopy size={16} />
            </button>
            <button className="btn-ghost p-1.5" title="貼り付け (Ctrl+V)" onClick={paste} disabled={!clipboard}>
              <ClipboardPaste size={16} />
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
          <code className="flex-1 truncate font-mono text-xs" title="ZMK キーマップでの表記">
            {code}
          </code>
          <button className="text-muted hover:text-fg" title="表記をコピー" onClick={() => navigator.clipboard?.writeText(code)}>
            <Copy size={13} />
          </button>
        </div>
        {notOnDevice && (
          <p className="mt-2 rounded-md bg-warn/10 px-2 py-1 text-xs text-warn">接続中のキーボードのファームウェアにこのビヘイビアがありません。適用するとエラーになります。</p>
        )}
      </div>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <div>
          <label className="label">動作の種類</label>
          <select className="input" value={def ? binding.b : ''} onChange={(e) => changeBehavior(e.target.value)}>
            {!def && <option value="">{binding.b}</option>}
            {[...groups.entries()].map(([g, defs]) => (
              <optgroup key={g} label={BEHAVIOR_GROUP_LABELS[g]}>
                {defs.map((d) => (
                  <option key={d.label} value={d.label} disabled={!!map && !map.byLabel.has(d.label) && !d.label.startsWith('__device_')}>
                    {d.nameJa}
                    {d.nameJa !== d.label ? ` (&${d.label})` : ''}
                    {map && !map.byLabel.has(d.label) && !d.label.startsWith('__device_') ? ' — 未搭載' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {def && <p className="mt-1 text-xs text-muted">{def.description}</p>}
        </div>

        {os && (binding.b === 'os_sel' || binding.b === 'os_to') && binding.raw === undefined && (
          <OsSwitchEditor os={os} binding={binding} onChange={(b) => update(b, 'OS 切替キーを変更')} />
        )}

        {def && binding.raw === undefined && def.params.length === binding.p.length && !(os && (binding.b === 'os_sel' || binding.b === 'os_to')) &&
          def.params.map((kind, i) => {
            // 2 番目のパラメータが不要なコマンド
            if ((kind === 'bt_arg' && !BT_COMMANDS.find((c) => c.value === binding.p[0])?.needsArg) || (kind === 'bl_arg' && !BL_COMMANDS.find((c) => c.value === binding.p[0])?.needsArg) || (kind === 'rgb_arg' && binding.p[0] !== 14)) return null;
            return (
              <ParamEditor
                key={`${binding.b}-${i}`}
                index={i}
                kind={kind}
                name={def.paramNames?.[i] ?? `パラメータ ${i + 1}`}
                value={binding.p[i]}
                onChange={(v) => setParam(i, v)}
                host={host}
                layers={project.layers.map((l, idx) => {
                  if (!os) return { id: l.id, label: `${idx}: ${l.name}` };
                  const s = splitLayerIndex(os, idx);
                  return { id: l.id, label: `Layer ${s.layer}${l.name !== `${OS_LIST[s.os].short} ${s.layer}` ? ` (${l.name})` : ''}`, group: OS_LIST[s.os].name, own: s.os === curOs };
                })}
                scrollVal={scrollValFor(project.keymapSource)}
              />
            );
          })}

        {binding.raw !== undefined && (
          <p className="rounded-md bg-surface-2 p-2 text-xs text-muted">
            パラメータ「{binding.raw}」は数値に変換できないため、ファイル出力ではそのまま出力されます。キーボードへの書き込みはできません。
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn-outline" onClick={() => update({ b: 'trans', p: [] }, '透過に設定')}>
            <ArrowDownToLine size={14} /> 透過 ▽
          </button>
          <button className="btn-outline" onClick={() => update({ b: 'none', p: [] }, 'なしに設定')}>
            <Ban size={14} /> なし
          </button>
        </div>
      </div>
    </div>
  );
}

function ParamEditor({
  index,
  kind,
  name,
  value,
  onChange,
  host,
  layers,
  scrollVal,
}: {
  index: number;
  kind: ParamKind;
  name: string;
  value: number;
  onChange: (v: number) => void;
  host: 'us' | 'jis';
  layers: { id: number; label: string; group?: string; own?: boolean }[];
  scrollVal: number;
}) {
  const pickerTarget = useEditor((s) => s.pickerTarget);
  const setPickerTarget = useEditor((s) => s.setPickerTarget);
  const active = pickerTarget === index;

  if (kind === 'keycode' || kind === 'modifier') {
    const mods = modsOf(value);
    const isPlainMod = kind === 'modifier' && MODIFIER_KEYCODES.some((m) => m.value === value);
    return (
      <div>
        <label className="label">{name}</label>
        {kind === 'modifier' && (
          <div className="mb-2 grid grid-cols-4 gap-1">
            {MODIFIER_KEYCODES.map((m) => (
              <button key={m.value} className="chip justify-center" data-on={value === m.value} onClick={() => onChange(m.value)}>
                {keycodeLabel(m.value, host)}
              </button>
            ))}
          </div>
        )}
        <button
          className={clsx('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors', active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent/60')}
          onClick={() => setPickerTarget(active ? null : index)}
        >
          <span className="text-base font-semibold">{keycodeLabel(value, host)}</span>
          <span className="text-xs text-muted">{active ? '↓ 下の一覧から選択中…' : isPlainMod ? '他のキーを選ぶ' : '一覧から選ぶ'}</span>
        </button>
        {kind === 'keycode' && (
          <div className="mt-2">
            <div className="mb-1 text-[11px] text-muted">修飾キーを同時に押す</div>
            <div className="grid grid-cols-4 gap-1">
              {MOD_FUNCS.map((m) => (
                <button key={m.fn} className="chip justify-center" data-on={!!(mods & m.bit)} onClick={() => onChange(applyMods(mods ^ m.bit, stripMods(value)))} title={`${m.fn}(…)`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  if (kind === 'layer') {
    const grouped = layers.some((l) => l.group);
    const own = layers.filter((l) => l.own);
    const others = layers.filter((l) => !l.own);
    const cur = layers.find((l) => l.id === value);
    return (
      <div>
        <label className="label">{name}</label>
        <select className="input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {!grouped &&
            layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          {grouped && (
            <optgroup label={`${own[0]?.group ?? ''} (表示中の OS)`}>
              {own.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </optgroup>
          )}
          {grouped &&
            [...new Set(others.map((l) => l.group))].map((g) => (
              <optgroup key={g} label={`${g} (別の OS)`}>
                {others
                  .filter((l) => l.group === g)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {g} {l.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          {!cur && <option value={value}>存在しないレイヤー ({value})</option>}
        </select>
        {grouped && cur && !cur.own && <p className="mt-1 text-xs text-warn">別の OS のレイヤーを指しています。OS ごとの設定を分けたい場合は、表示中の OS のレイヤーを選んでください。</p>}
      </div>
    );
  }
  const lists: Partial<Record<ParamKind, NamedValue[]>> = {
    bt_cmd: BT_COMMANDS,
    out_cmd: OUT_COMMANDS,
    rgb_cmd: [...RGB_COMMANDS, { value: 14, name: 'RGB_COLOR_HSB', label: '色を指定 (HSB)' }],
    bl_cmd: BL_COMMANDS,
    ep_cmd: EP_COMMANDS,
    mouse_button: MOUSE_BUTTONS,
    mouse_move: MOUSE_MOVES,
    mouse_scroll: mouseScrolls(scrollVal),
  };
  const list = lists[kind];
  if (list) {
    const known = list.some((c) => c.value === value >>> 0);
    return (
      <div>
        <label className="label">{name}</label>
        <select className="input" value={known ? value >>> 0 : 'custom'} onChange={(e) => onChange(Number(e.target.value))}>
          {list.map((c) => (
            <option key={c.name} value={c.value}>
              {c.label} ({c.name})
            </option>
          ))}
          {!known && <option value="custom">カスタム値 ({value})</option>}
        </select>
      </div>
    );
  }
  if (kind === 'bt_arg') {
    return (
      <div>
        <label className="label">{name}</label>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} className="chip h-9 w-11 justify-center text-sm" data-on={value === n} onClick={() => onChange(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'rgb_arg') {
    const h = (value >>> 16) & 0xffff;
    const s = (value >>> 8) & 0xff;
    const b = value & 0xff;
    const set = (nh: number, ns: number, nb: number) => onChange(((nh & 0xffff) << 16) | ((ns & 0xff) << 8) | (nb & 0xff));
    return (
      <div className="grid grid-cols-3 gap-2">
        {[
          ['色相 (0-360)', h, 360, (v: number) => set(v, s, b)],
          ['彩度 (0-100)', s, 100, (v: number) => set(h, v, b)],
          ['明るさ (0-100)', b, 100, (v: number) => set(h, s, v)],
        ].map(([label, v, max, fn]) => (
          <div key={label as string}>
            <label className="label">{label as string}</label>
            <input className="input" type="number" min={0} max={max as number} value={v as number} onChange={(e) => (fn as (v: number) => void)(Number(e.target.value))} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      <label className="label">{name}</label>
      <input
        className="input font-mono"
        defaultValue={String(value)}
        key={value}
        onBlur={(e) => {
          const t = e.target.value.trim();
          const v = /^0x/i.test(t) ? parseInt(t, 16) : parseInt(t, 10);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
      <p className="mt-1 text-xs text-muted">数値 (10進 / 0x で 16進)</p>
    </div>
  );
}

/** OS 切替キー (&os_sel / &os_to) の設定 */
function OsSwitchEditor({ os, binding, onChange }: { os: OsLayout; binding: Binding; onChange: (b: Binding) => void }) {
  const linked = binding.b === 'os_sel';
  const target = linked ? binding.p[1] : binding.p[0];
  const t = splitLayerIndex(os, target ?? 0);
  const profile = linked ? binding.p[0] : OS_LIST[t.os]?.profile;
  const standard = linked ? OS_LIST[t.os]?.profile === profile && target === osDefaultIndex(os, t.os) : target === osDefaultIndex(os, t.os);
  const set = (osIndex: number, layer: number, link: boolean, prof = OS_LIST[osIndex].profile) =>
    onChange(link ? { b: 'os_sel', p: [prof, absLayer(os, osIndex, layer)] } : { b: 'os_to', p: [absLayer(os, osIndex, layer)] });
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div>
        <label className="label">切り替え先の OS</label>
        <div className="grid grid-cols-3 gap-1">
          {OS_LIST.map((o, i) => (
            <button key={o.id} className="chip justify-center" data-on={t.os === i} onClick={() => set(i, os.systems[i].defaultLayer, linked)}>
              {o.name}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={linked} onChange={(e) => set(t.os, t.layer, e.target.checked)} />
        Bluetooth プロファイルも切り替える (BT {OS_LIST[t.os]?.profile})
      </label>
      <div>
        <label className="label">移動先のレイヤー</label>
        <select className="input" value={t.layer} onChange={(e) => set(t.os, Number(e.target.value), linked, profile)}>
          {Array.from({ length: os.layersPerOs }, (_, j) => (
            <option key={j} value={j}>
              Layer {j}
              {j === os.systems[t.os].defaultLayer ? ' (デフォルト)' : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          {standard
            ? 'OS のデフォルトレイヤーを変更すると、このキーの移動先も自動で更新されます。'
            : 'デフォルトレイヤー以外を指定しています (デフォルトレイヤーを変更しても、このキーは更新されません)。'}
          切り替えると、それまでの OS のレイヤーはすべてオフになります (&amp;to と同じ動作)。
        </p>
      </div>
    </div>
  );
}
