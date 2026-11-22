/**
 * ショートカット・コンボ・ロータリーエンコーダーの設定画面
 */
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Copy, Plus, Search, Trash2, X, Check, AlertTriangle, Info } from 'lucide-react';
import { Modal } from './ui';
import { useEditor, scrollValFor } from '../state/editor';
import { useRegistry } from '../state/device';
import type { Binding, ComboDef, OsId, SensorBinding, ShortcutDef } from '../model/types';
import { KEYCODES, MODIFIER_KEYCODES, keycodeLabel, keycodeSearchText, preferredName } from '../zmk/keycodes';
import { keycodeDescriptionJa } from '../zmk/keycodes.ja';
import { newId } from '../model/project';
import { OS_LIST, absLayer, groupName, groupOs, osInfo, splitLayerIndex } from '../model/os';
import { MAX_NORMAL_KEYS, SHORTCUT_PRESETS, presetKeys, resolveShortcut, shortcutText } from '../model/shortcuts';
import { ENCODER_ACTIONS, ENCODER_ALLOWED_BEHAVIORS, ENCODER_PAIRS, encoderAction } from '../model/encoders';
import { behaviorRegistry, bindingsEqual, evaluateParamText, formatBinding } from '../zmk/keymap';
import { describeBinding, describeSensorAction, type DisplayContext } from '../lib/display';
import { readCombos, readEncoder, readMacros, type RuntimeMacro } from '../model/runtime';

// ---------------------------------------------------------------------------
// キーの組み合わせの編集 (追加・削除・並べ替え。個数の制限なし)
// ---------------------------------------------------------------------------

export function KeyListEditor({ keys, onChange }: { keys: number[]; onChange: (k: number[]) => void }) {
  const host = useEditor((s) => s.settings.hostLayout);
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return KEYCODES.filter((k) => t.split(/\s+/).every((w) => keycodeSearchText(k).includes(w))).slice(0, 30);
  }, [q]);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    const next = [...keys];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (v: number) => {
    if (!keys.includes(v)) onChange([...keys, v]);
    setQ('');
  };
  return (
    <div>
      <div className="flex min-h-11 flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-2 p-1.5">
        {keys.map((k, i) => (
          <span key={`${k}-${i}`} className="inline-flex items-center gap-0.5">
            {i > 0 && <span className="px-0.5 text-muted">+</span>}
            <span className="inline-flex items-center gap-0.5 rounded-md border border-line bg-surface px-1.5 py-1 text-sm font-semibold" title={keycodeDescriptionJa(KEYCODES.find((x) => x.value === k) ?? { names: [''], comment: '' })}>
              {keycodeLabel(k, host)}
              <button className="text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title="前へ" aria-label="前へ">
                <ArrowUp size={11} className="-rotate-90" />
              </button>
              <button className="text-muted hover:text-fg disabled:opacity-30" disabled={i === keys.length - 1} onClick={() => move(i, 1)} title="後ろへ" aria-label="後ろへ">
                <ArrowDown size={11} className="-rotate-90" />
              </button>
              <button className="text-muted hover:text-danger" onClick={() => onChange(keys.filter((_, j) => j !== i))} title="削除" aria-label="削除">
                <X size={12} />
              </button>
            </span>
          </span>
        ))}
        {!keys.length && <span className="px-1 text-xs text-muted">下からキーを追加してください</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {MODIFIER_KEYCODES.slice(0, 4).map((m) => (
          <button key={m.value} className="chip" data-on={keys.includes(m.value)} onClick={() => (keys.includes(m.value) ? onChange(keys.filter((x) => x !== m.value)) : add(m.value))}>
            {keycodeLabel(m.value, host)}
          </button>
        ))}
      </div>
      <div className="relative mt-2">
        <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
        <input className="input pl-8" placeholder="追加するキーを検索 (例: c, tab, f4, 音量)" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <div className="panel scroll-thin absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto p-1 shadow-xl">
            {results.map((k) => (
              <button key={k.value} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-surface-2" onClick={() => add(k.value)}>
                <span className="w-16 shrink-0 font-semibold">{keycodeLabel(k.value, host)}</span>
                <span className="w-24 shrink-0 truncate font-mono text-[11px] text-muted">{preferredName(k)}</span>
                <span className="truncate text-xs text-muted">{keycodeDescriptionJa(k)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShortcutStatus({ keys }: { keys: number[] }) {
  const r = resolveShortcut({ id: 'x', keys });
  if (r.kind === 'invalid') {
    return (
      <p className="flex items-start gap-1.5 rounded-md bg-danger/10 px-2 py-1.5 text-xs text-danger">
        <AlertTriangle size={13} className="mt-px shrink-0" /> {r.error}
      </p>
    );
  }
  if (r.kind === 'kp') {
    return (
      <p className="flex items-start gap-1.5 rounded-md bg-ok/10 px-2 py-1.5 text-xs text-ok">
        <Check size={13} className="mt-px shrink-0" /> 修飾キー + 1 キーの組み合わせです。キーボードに直接書き込めます ({formatBinding(r.binding!, { behaviors: behaviorRegistry() })})
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-warn/10 px-2 py-1.5 text-xs text-warn">
      <Info size={13} className="mt-px shrink-0" /> 通常キーを {r.normal.length} 個同時に押すため、マクロとして出力します。ZMK Studio はマクロを作成できないので、「ファイル」→ ZIP 出力でファームウェアをビルドしてください (通常キーは最大 {MAX_NORMAL_KEYS} 個)。
    </p>
  );
}

// ---------------------------------------------------------------------------
// ショートカットの管理
// ---------------------------------------------------------------------------

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const layerIndex = useEditor((s) => s.layerIndex);
  const selected = useEditor((s) => s.selected);
  const save = useEditor((s) => s.saveShortcut);
  const remove = useEditor((s) => s.removeShortcut);
  const assign = useEditor((s) => s.assign);
  const toast = useEditor((s) => s.toast);
  const host = useEditor((s) => s.settings.hostLayout);
  const curOs: OsId = project?.os ? groupOs(project.os, splitLayerIndex(project.os, layerIndex).os).id : 'windows';
  const [filterOs, setFilterOs] = useState<OsId | 'all-list'>(curOs);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<ShortcutDef | null>(null);
  const list = project?.shortcuts ?? [];

  const shown = list.filter(
    (x) =>
      (filterOs === 'all-list' || x.os === filterOs || x.os === 'all') &&
      (!q.trim() || `${x.name} ${shortcutText(x.keys, host)} ${x.note ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const presetOs: OsId = filterOs === 'all-list' ? curOs : filterOs;

  const startNew = (preset?: { name: string; keys: number[]; note?: string }) =>
    setEditing({ id: newId(), name: preset?.name ?? '新しいショートカット', os: presetOs, keys: preset?.keys ?? [], note: preset?.note });

  const assignTo = (s: ShortcutDef) => {
    const r = resolveShortcut(s);
    if (!r.binding) return toast('error', r.error ?? '割り当てできません');
    if (!selected.length) return toast('info', '先にキーボード上のキーを選択してください');
    assign(r.binding, `ショートカット「${s.name}」を割り当て`);
    toast('success', `「${s.name}」を ${selected.length} 個のキーに割り当てました`);
  };

  return (
    <Modal open onClose={onClose} title="ショートカット" wide>
      <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1">
            {OS_LIST.map((o) => (
              <button key={o.id} className="chip" data-on={filterOs === o.id} onClick={() => setFilterOs(o.id)}>
                {o.name}
              </button>
            ))}
            <button className="chip" data-on={filterOs === 'all-list'} onClick={() => setFilterOs('all-list')}>
              すべて
            </button>
          </div>
          <div className="relative mb-2">
            <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
            <input className="input pl-8" placeholder="ショートカットを検索" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="space-y-1">
            {shown.map((s) => {
              const r = resolveShortcut(s);
              return (
                <div key={s.id} className={clsx('rounded-lg border px-2.5 py-2', editing?.id === s.id ? 'border-accent bg-accent-soft' : 'border-line')}>
                  <div className="flex items-center gap-2">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEditing({ ...s, keys: [...s.keys] })}>
                      <div className="truncate text-sm font-medium">{s.name}</div>
                      <div className="truncate text-xs text-muted">
                        {shortcutText(s.keys, host)} ・ {s.os === 'all' ? '全 OS' : osInfo(s.os).name}
                        {r.kind === 'macro' && ' ・ マクロ'}
                        {r.kind === 'invalid' && ' ・ ⚠ 設定エラー'}
                      </div>
                    </button>
                    <button className="btn-outline px-2 py-1 text-xs" onClick={() => assignTo(s)} disabled={!r.binding} title="選択中のキーに割り当て">
                      割り当て
                    </button>
                    <button className="btn-ghost p-1" title="複製" onClick={() => save({ ...s, id: newId(), name: `${s.name} のコピー`, keys: [...s.keys] })}>
                      <Copy size={14} />
                    </button>
                    <button
                      className="btn-ghost p-1 text-danger"
                      title="削除"
                      onClick={() => {
                        if (!confirm(`「${s.name}」を削除しますか？${r.kind === 'macro' ? '\n割り当て済みのキーは「なし」になります。' : ''}`)) return;
                        remove(s.id);
                        if (editing?.id === s.id) setEditing(null);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {s.note && <div className="mt-1 text-[11px] text-muted">※ {s.note}</div>}
                </div>
              );
            })}
            {!shown.length && <p className="py-4 text-center text-xs text-muted">登録したショートカットはありません。右のプリセットから追加するか、新規作成してください。</p>}
          </div>
        </div>

        <div className="min-w-0">
          {editing ? (
            <ShortcutEditor
              key={editing.id}
              value={editing}
              exists={list.some((x) => x.id === editing.id)}
              onCancel={() => setEditing(null)}
              onSave={(s) => {
                save(s);
                setEditing(s);
                toast('success', `「${s.name}」を保存しました`);
              }}
            />
          ) : (
            <div>
              <button className="btn-primary mb-3 w-full justify-center" onClick={() => startNew()}>
                <Plus size={15} /> 新しいショートカットを作成
              </button>
              <div className="label">{osInfo(presetOs).name} のプリセット (クリックで追加)</div>
              <div className="grid gap-1 sm:grid-cols-2">
                {SHORTCUT_PRESETS[presetOs].map((p) => (
                  <button
                    key={p.name}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-left hover:border-accent/60 hover:bg-surface-2"
                    onClick={() => startNew({ name: p.name, keys: presetKeys(p), note: p.note })}
                    title={p.note}
                  >
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted">
                      {shortcutText(presetKeys(p), host)}
                      {p.note && ' ※'}
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">※ OS やアプリによって動作が異なる場合があります (※ 印は注意書きあり)。</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ShortcutEditor({ value, exists, onSave, onCancel }: { value: ShortcutDef; exists: boolean; onSave: (s: ShortcutDef) => void; onCancel: () => void }) {
  const [s, setS] = useState(value);
  const r = resolveShortcut(s);
  return (
    <div className="space-y-3">
      <div>
        <label className="label">ショートカット名</label>
        <input className="input" value={s.name} maxLength={40} onChange={(e) => setS({ ...s, name: e.target.value })} />
      </div>
      <div>
        <label className="label">OS</label>
        <select className="input" value={s.os} onChange={(e) => setS({ ...s, os: e.target.value as ShortcutDef['os'] })}>
          {OS_LIST.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value="all">すべての OS 共通</option>
        </select>
      </div>
      <div>
        <label className="label">キーの組み合わせ (押す順。いくつでも追加できます)</label>
        <KeyListEditor keys={s.keys} onChange={(keys) => setS({ ...s, keys })} />
      </div>
      <ShortcutStatus keys={s.keys} />
      <div>
        <label className="label">メモ (任意)</label>
        <input className="input" value={s.note ?? ''} placeholder="例: 対応アプリのみ" onChange={(e) => setS({ ...s, note: e.target.value || undefined })} />
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>
          閉じる
        </button>
        <button className="btn-primary" disabled={!s.name.trim() || r.kind === 'invalid'} onClick={() => onSave({ ...s, name: s.name.trim() })}>
          {exists ? '保存 (割り当て済みのキーも更新)' : '登録'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 動作の選択 (コンボ・エンコーダー用): キー / ショートカット / その他のビヘイビア
// ---------------------------------------------------------------------------

function BindingPicker({ value, onChange, allow }: { value: Binding; onChange: (b: Binding) => void; allow?: (b: Binding) => string | null }) {
  const project = useEditor((s) => s.project);
  const host = useEditor((s) => s.settings.hostLayout);
  const registry = useRegistry();
  const shortcuts = project?.shortcuts ?? [];
  const scMatch = shortcuts.find((x) => {
    const r = resolveShortcut(x);
    return r.binding && bindingsEqual(r.binding, value);
  });
  const initialMode = scMatch ? 'shortcut' : value.b === 'kp' ? 'keys' : 'raw';
  const [mode, setMode] = useState<'keys' | 'shortcut' | 'raw'>(initialMode);
  const [keys, setKeys] = useState<number[]>(() => (value.b === 'kp' ? keysFromKp(value.p[0] ?? 0) : []));
  const layerIndexById = useMemo(() => new Map(project?.layers.map((l, i) => [l.id, i]) ?? []), [project]);
  const [raw, setRaw] = useState(() => formatBinding(value, { behaviors: registry, layerIndexById, scrollVal: project ? scrollValFor(project.keymapSource) : 10 }));
  const [rawError, setRawError] = useState<string | null>(null);

  const emit = (b: Binding) => {
    const err = allow?.(b);
    if (err) setRawError(err);
    else {
      setRawError(null);
      onChange(b);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {(
          [
            ['keys', 'キー / 修飾キー'],
            ['shortcut', '登録したショートカット'],
            ['raw', 'その他 (ZMK 表記)'],
          ] as const
        ).map(([m, label]) => (
          <button key={m} className="chip" data-on={mode === m} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'keys' && (
        <>
          <KeyListEditor
            keys={keys}
            onChange={(k) => {
              setKeys(k);
              const r = resolveShortcut({ id: 'tmp', keys: k });
              if (r.kind === 'kp') emit(r.binding!);
              else if (r.kind === 'macro') setRawError('通常キーを 2 個以上同時に押す場合は、ショートカットとして登録してから「登録したショートカット」で選んでください');
              else setRawError(r.error ?? null);
            }}
          />
        </>
      )}
      {mode === 'shortcut' && (
        <select
          className="input"
          value={scMatch?.id ?? ''}
          onChange={(e) => {
            const sc = shortcuts.find((x) => x.id === e.target.value);
            const r = sc && resolveShortcut(sc);
            if (r?.binding) emit(r.binding);
          }}
        >
          <option value="">選択してください</option>
          {shortcuts.map((x) => (
            <option key={x.id} value={x.id} disabled={!resolveShortcut(x).binding}>
              {x.name} ({shortcutText(x.keys, host)}){x.os !== 'all' ? ` — ${osInfo(x.os).short}` : ''}
            </option>
          ))}
        </select>
      )}
      {mode === 'raw' && (
        <div className="flex gap-2">
          <input className="input font-mono" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="例: &bt BT_SEL 0 / &msc SCRL_UP" />
          <button
            className="btn-outline shrink-0"
            onClick={() => {
              try {
                const m = /^&?([a-zA-Z_][a-zA-Z0-9_]*)\s*(.*)$/.exec(raw.trim());
                if (!m) throw new Error('「&ビヘイビア パラメータ」の形式で入力してください');
                const def = registry.get(m[1]);
                if (!def) throw new Error(`&${m[1]} は使用できません`);
                const p = m[2].trim() ? evaluateParamText(m[2], project!.keymapSource) : [];
                if (p.length !== def.params.length) throw new Error(`&${m[1]} のパラメータは ${def.params.length} 個です`);
                emit({ b: m[1], p: p.map((v) => v >>> 0) });
              } catch (e) {
                setRawError((e as Error).message);
              }
            }}
          >
            反映
          </button>
        </div>
      )}
      {rawError && <p className="text-xs text-danger">{rawError}</p>}
    </div>
  );
}

function keysFromKp(v: number): number[] {
  const mods = (v >>> 24) & 0xff;
  const out: number[] = [];
  MODIFIER_KEYCODES.forEach((m, i) => mods & (1 << i) && out.push(m.value));
  const base = v & 0x00ffffff;
  if (!out.includes(base)) out.push(base);
  return out;
}

function useDisplayCtx(): DisplayContext | null {
  const project = useEditor((s) => s.project);
  const layerIndex = useEditor((s) => s.layerIndex);
  const host = useEditor((s) => s.settings.hostLayout);
  const registry = useRegistry();
  if (!project) return null;
  return { behaviors: registry, layers: project.layers, host, scrollVal: scrollValFor(project.keymapSource), os: project.os, current: layerIndex, shortcuts: project.shortcuts };
}

// ---------------------------------------------------------------------------
// コンボ
// ---------------------------------------------------------------------------

/** ZMK v0.2.1 の既定値 (CONFIG_ZMK_COMBO_MAX_KEYS_PER_COMBO / MAX_COMBOS_PER_KEY) */
const COMBO_MAX_KEYS = 4;
const COMBO_MAX_PER_KEY = 5;

type ComboScope = 'all' | 'os' | 'layer' | 'custom';

export function CombosDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const kb = useEditor((s) => s.keyboard);
  const layerIndex = useEditor((s) => s.layerIndex);
  const saveCombo = useEditor((s) => s.saveCombo);
  const removeCombo = useEditor((s) => s.removeCombo);
  const toast = useEditor((s) => s.toast);
  const ctx = useDisplayCtx();
  const [editing, setEditing] = useState<ComboDef | null>(null);
  if (!project || !ctx) return null;
  const rt = kb.runtime;
  const combos = rt ? readCombos(project, rt) : (project.combos ?? []);
  const os = project.os;
  const curOs = os ? splitLayerIndex(os, layerIndex).os : 0;
  const osLayers = os ? Array.from({ length: os.layersPerOs }, (_, j) => project.layers[absLayer(os, curOs, j)].id) : [];

  const scopeOf = (c: ComboDef): ComboScope => {
    if (!c.layers.length) return 'all';
    if (os && c.layers.length === osLayers.length && osLayers.every((id) => c.layers.includes(id))) return 'os';
    if (c.layers.length === 1 && c.layers[0] === project.layers[layerIndex].id) return 'layer';
    return 'custom';
  };
  const layerText = (c: ComboDef) => (c.layers.length ? c.layers.map((id) => describeLayer(id)).join(', ') : 'すべてのレイヤー');
  const describeLayer = (id: number) => {
    const i = project.layers.findIndex((l) => l.id === id);
    if (i < 0) return `?${id}`;
    if (!os) return project.layers[i].name;
    const s = splitLayerIndex(os, i);
    return `BT${s.os + 1} L${s.layer}`;
  };

  const validate = (c: ComboDef): string | null => {
    if (c.positions.length < 2) return 'キーを 2 個以上選んでください';
    if (c.positions.length > COMBO_MAX_KEYS) return `1 つのコンボのキーは ${COMBO_MAX_KEYS} 個までです (ZMK の既定の上限)`;
    for (const pos of c.positions) {
      const n = combos.filter((x) => x.id !== c.id && x.positions.includes(pos)).length + 1;
      if (n > COMBO_MAX_PER_KEY) return `キー #${pos + 1} を使うコンボが ${COMBO_MAX_PER_KEY} 個を超えます (ZMK の既定の上限)`;
    }
    if (c.timeoutMs < 10 || c.timeoutMs > 1000) return '同時押しの判定時間は 10〜1000 ms で指定してください';
    return null;
  };

  return (
    <Modal open onClose={onClose} title="コンボ (同時押し)" wide>
      <p className="mb-3 rounded-lg bg-surface-2 p-2.5 text-xs text-muted">
        複数のキーを同時に押したときに、別のキー入力やショートカットを送ります。
        {rt
          ? ` 追加・編集・削除は「キーボードに適用」でキーボードに直接書き込まれ、すぐに反映されます (UF2 の書き込みは不要。最大 ${rt.comboSlots} 個・1 つのコンボのキーは 4 個まで)。`
          : ' ZMK Studio はコンボの編集に対応していないため、「ファイル」→ ZIP 出力でファームウェアをビルドして反映します。'}
      </p>
      {editing ? (
        <ComboEditor
          key={editing.id}
          value={editing}
          kb={kb}
          scopes={{ all: [], os: osLayers, layer: [project.layers[layerIndex].id] }}
          scopeOf={scopeOf}
          osName={os ? groupName(os, curOs) : ''}
          layerName={describeLayer(project.layers[layerIndex].id)}
          validate={validate}
          onCancel={() => setEditing(null)}
          onSave={(c) => {
            saveCombo(c);
            setEditing(null);
            toast('success', `コンボ「${c.name}」を保存しました`);
          }}
        />
      ) : (
        <>
          <div className="space-y-1.5">
            {combos.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing({ ...c, positions: [...c.positions], layers: [...c.layers] })}>
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted">
                    {c.positions.map((p) => describeBinding(project.layers[layerIndex].bindings[p], ctx).main || `#${p + 1}`).join(' + ')} → {describeSensorAction(c.binding, ctx)} ・ {layerText(c)} ・ {c.timeoutMs} ms
                  </div>
                </button>
                <button className="btn-ghost p-1" title="複製" onClick={() => saveCombo({ ...c, id: newId(), name: `${c.name}_2` })}>
                  <Copy size={14} />
                </button>
                <button className="btn-ghost p-1 text-danger" title="削除" onClick={() => confirm(`コンボ「${c.name}」を削除しますか？`) && removeCombo(c.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!combos.length && <p className="py-4 text-center text-xs text-muted">コンボはまだありません。</p>}
          </div>
          <button
            className="btn-primary mt-3"
            onClick={() => setEditing({ id: newId(), name: `combo_${combos.length + 1}`, positions: [], binding: { b: 'kp', p: [KEYCODES.find((k) => k.names.includes('ESCAPE'))!.value] }, layers: osLayers, timeoutMs: 50 })}
          >
            <Plus size={15} /> コンボを追加
          </button>
        </>
      )}
    </Modal>
  );
}

function ComboEditor({
  value,
  kb,
  scopes,
  scopeOf,
  osName,
  layerName,
  validate,
  onSave,
  onCancel,
}: {
  value: ComboDef;
  kb: ReturnType<typeof useEditor.getState>['keyboard'];
  scopes: Record<'all' | 'os' | 'layer', number[]>;
  scopeOf: (c: ComboDef) => ComboScope;
  osName: string;
  layerName: string;
  validate: (c: ComboDef) => string | null;
  onSave: (c: ComboDef) => void;
  onCancel: () => void;
}) {
  const [c, setC] = useState(value);
  const project = useEditor((s) => s.project)!;
  const layerIndex = useEditor((s) => s.layerIndex);
  const ctx = useDisplayCtx()!;
  const err = validate(c);
  const scope = scopeOf(c);
  const maxX = Math.max(...kb.keys.map((k) => k.x + k.w));
  const maxY = Math.max(...kb.keys.map((k) => k.y + k.h));
  const u = 34;
  const toggle = (pos: number) => setC({ ...c, positions: c.positions.includes(pos) ? c.positions.filter((p) => p !== pos) : [...c.positions, pos].sort((a, b) => a - b) });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label">名前 (英数字にするとキーマップのノード名にも使います)</label>
          <input className="input" value={c.name} maxLength={30} onChange={(e) => setC({ ...c, name: e.target.value })} />
        </div>
        <div>
          <label className="label">判定時間 (ms)</label>
          <input className="input w-28" type="number" min={10} max={1000} value={c.timeoutMs} onChange={(e) => setC({ ...c, timeoutMs: Number(e.target.value) })} />
        </div>
      </div>
      <div>
        <label className="label">同時に押すキー (クリックで選択。{COMBO_MAX_KEYS} 個まで)</label>
        <div className="overflow-x-auto rounded-lg bg-surface-2 p-2">
          <div className="relative mx-auto" style={{ width: maxX * u, height: maxY * u }}>
            {kb.keys.map((k, pos) => {
              const on = c.positions.includes(pos);
              return (
                <button
                  key={pos}
                  className={clsx('absolute truncate rounded-md border px-0.5 text-[10px]', on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface hover:border-accent/60')}
                  style={{ left: k.x * u + 1, top: k.y * u + 1, width: k.w * u - 2, height: k.h * u - 2 }}
                  onClick={() => toggle(pos)}
                  title={`#${pos + 1}`}
                >
                  {describeBinding(project.layers[layerIndex].bindings[pos], ctx).main}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div>
        <label className="label">実行する動作</label>
        <BindingPicker value={c.binding} onChange={(b) => setC({ ...c, binding: b })} />
        <p className="mt-1 text-xs text-muted">現在: {describeSensorAction(c.binding, ctx)}</p>
      </div>
      <div>
        <label className="label">有効なレイヤー</label>
        <div className="flex flex-wrap gap-1">
          <button className="chip" data-on={scope === 'os'} onClick={() => setC({ ...c, layers: scopes.os })} disabled={!scopes.os.length}>
            {osName} の全レイヤー
          </button>
          <button className="chip" data-on={scope === 'layer'} onClick={() => setC({ ...c, layers: scopes.layer })}>
            {layerName} のみ
          </button>
          <button className="chip" data-on={scope === 'all'} onClick={() => setC({ ...c, layers: [] })}>
            すべての OS・レイヤー
          </button>
          {scope === 'custom' && <span className="chip" data-on>カスタム ({c.layers.length} レイヤー)</span>}
        </div>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>
          キャンセル
        </button>
        <button className="btn-primary" disabled={!!err || !c.name.trim()} onClick={() => onSave({ ...c, name: c.name.trim() })}>
          保存
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ロータリーエンコーダー
// ---------------------------------------------------------------------------

const TRANS: Binding = { b: 'trans', p: [] };
const NONE: Binding = { b: 'none', p: [] };

export function EncoderDialog({ sensorIndex, onClose }: { sensorIndex: number; onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const kb = useEditor((s) => s.keyboard);
  const layerIndex = useEditor((s) => s.layerIndex);
  const setSensor = useEditor((s) => s.setSensor);
  const host = useEditor((s) => s.settings.hostLayout);
  const toast = useEditor((s) => s.toast);
  const ctx = useDisplayCtx();
  const enc = kb.encoders?.find((e) => e.sensorIndex === sensorIndex);
  const layer = project?.layers[layerIndex];
  const rtLayout = kb.runtime;
  const cur: SensorBinding = layer ? (rtLayout ? readEncoder(layer, rtLayout, sensorIndex) : (layer.sensors?.[sensorIndex] ?? { cw: TRANS, ccw: TRANS })) : { cw: TRANS, ccw: TRANS };
  const [value, setValue] = useState<SensorBinding>(cur);
  const [scope, setScope] = useState<'layer' | 'os' | 'all'>('layer');
  if (!project || !layer || !enc || !ctx) return null;
  const os = project.os;
  const s = os ? splitLayerIndex(os, layerIndex) : { os: 0, layer: layerIndex };
  const osId: OsId = os ? groupOs(os, s.os).id : 'windows';
  const sv = scrollValFor(project.keymapSource);
  const presetBinding = (id: string) => encoderAction(id)!.binding(osId, host, sv);
  const matchPreset = (b: Binding) => ENCODER_ACTIONS.find((a) => bindingsEqual(a.binding(osId, host, sv), b))?.id;
  const allowEncoder = (b: Binding) => (ENCODER_ALLOWED_BEHAVIORS.has(b.b) || /^sc_/.test(b.b) ? null : `&${b.b} はエンコーダーには割り当てられません (押して離すだけの動作のみ)`);
  const transBoth = value.cw.b === 'trans' && value.ccw.b === 'trans';

  const targets = (): number[] => {
    if (scope === 'layer' || !os) return [layerIndex];
    if (scope === 'os') return Array.from({ length: os.layersPerOs }, (_, j) => absLayer(os, s.os, j));
    return project.layers.map((_, i) => i);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${enc.name} — ${os ? `${groupName(os, s.os)} / Layer ${s.layer}` : layer.name}`}
      wide
      footer={
        <>
          <select className="input mr-auto w-auto" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="layer">このレイヤーだけに設定</option>
            {os && <option value="os">{groupName(os, s.os)} の全レイヤー (5) に設定</option>}
            <option value="all">すべての OS・レイヤー ({project.layers.length}) に設定</option>
          </select>
          <button className="btn-ghost" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              const t = targets();
              setSensor(t, sensorIndex, value);
              toast('success', rtLayout ? `${enc.name} の設定を ${t.length} レイヤーに保存しました。「キーボードに適用」で即時に反映されます` : `${enc.name} の設定を ${t.length} レイヤーに保存しました (反映にはファームウェアのビルドが必要です)`);
              onClose();
            }}
          >
            保存
          </button>
        </>
      }
    >
      {rtLayout ? (
        <p className="mb-3 rounded-lg bg-ok/10 p-2.5 text-xs text-ok">
          保存した設定は「キーボードに適用」でキーボードに直接書き込まれ、すぐに反映されます (UF2 の書き込みは不要)。時計回り・反時計回りはそれぞれ「透過」にでき、透過にすると下のレイヤーの設定が使われます。
        </p>
      ) : (
        <p className="mb-3 rounded-lg bg-warn/10 p-2.5 text-xs text-warn">
          ZMK Studio はエンコーダーの割り当て (sensor-bindings) の書き込みに対応していません。保存した設定は「ファイル」→「ZMK 設定一式 (ZIP)」に含まれ、ファームウェアをビルドして書き込むと反映されます。
        </p>
      )}
      <div className="mb-3">
        <div className="label">よく使う組み合わせ</div>
        <div className="flex flex-wrap gap-1">
          {ENCODER_PAIRS.map((p) => (
            <button key={p.name} className="chip" onClick={() => setValue({ cw: presetBinding(p.cw), ccw: presetBinding(p.ccw) })}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['cw', 'ccw'] as const).map((dir) => (
          <DirEditor
            key={dir}
            label={dir === 'cw' ? '時計回り ↻' : '反時計回り ↺'}
            value={value[dir]}
            ctx={ctx}
            matchPreset={matchPreset}
            allow={allowEncoder}
            onPick={(v, nb) => {
              // 透過は両方向まとめてのみ有効 (ZMK の仕様)
              if (rtLayout) setValue({ ...value, [dir]: nb });
              else if (v === '__trans') setValue({ cw: TRANS, ccw: TRANS });
              else setValue({ ...value, [dir]: nb, ...(transBoth ? { [dir === 'cw' ? 'ccw' : 'cw']: NONE } : {}) });
            }}
            presetBinding={presetBinding}
          />
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-dashed border-line p-3 text-xs text-muted">
        <span className="font-semibold text-fg">押し込み: 設定できません。</span> Choco-Key のキーマトリクス (5 行 × 11 列、42 キー) にはエンコーダーの押し込みスイッチが割り当てられていないため、ファームウェアからは押し込みを検出できません (Choco-Key.dtsi の matrix transform で確認)。
      </div>
      <p className="mt-2 text-[11px] text-muted">
        回転方向は ZMK の sensor-rotate の 1 番目 = 時計回りとして扱います。実際の回転方向は配線 (A/B 相) によって逆になる場合があるため、実機で確認してください。
        {!rtLayout &&
          '「透過」は ZMK の仕様上、両方向まとめてのみ設定できます。また右エンコーダー (センサー 0) を透過にするには、同じレイヤーの左エンコーダー (センサー 1) も透過にする必要があります (そうでない場合は「なし」として出力)。'}
      </p>
    </Modal>
  );
}

function DirEditor({
  label,
  value: b,
  ctx,
  matchPreset,
  allow,
  onPick,
  presetBinding,
}: {
  label: string;
  value: Binding;
  ctx: DisplayContext;
  matchPreset: (b: Binding) => string | undefined;
  allow: (b: Binding) => string | null;
  onPick: (presetId: string, b: Binding) => void;
  presetBinding: (id: string) => Binding;
}) {
  const pid = b.b === 'trans' ? '__trans' : b.b === 'none' ? '__none' : (matchPreset(b) ?? '__custom');
  const [custom, setCustom] = useState(pid === '__custom');
  const groups = [...new Set(ENCODER_ACTIONS.map((a) => a.group))];
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="shrink-0 text-sm font-semibold">{label}</span>
        <span className="truncate text-xs text-muted">{describeSensorAction(b, ctx)}</span>
      </div>
      <select
        className="input"
        value={custom ? '__custom' : pid}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__custom') return setCustom(true);
          setCustom(false);
          onPick(v, v === '__trans' ? TRANS : v === '__none' ? NONE : presetBinding(v));
        }}
      >
        <option value="__trans">下のレイヤーと同じ (透過)</option>
        <option value="__none">なし</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {ENCODER_ACTIONS.filter((a) => a.group === g).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.note ? ` — ${a.note}` : ''}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="__custom">カスタム (キー・ショートカットを指定)…</option>
      </select>
      {custom && (
        <div className="mt-2">
          <BindingPicker value={b.b === 'trans' || b.b === 'none' ? { b: 'kp', p: [KEYCODES[0].value] } : b} allow={allow} onChange={(nb) => onPick('__custom', nb)} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 即時編集マクロ (6 スロット × 8 ステップ)
// ---------------------------------------------------------------------------

export function RuntimeMacrosDialog({ initialSlot, onClose }: { initialSlot?: number; onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const kb = useEditor((s) => s.keyboard);
  const selected = useEditor((s) => s.selected);
  const save = useEditor((s) => s.saveRuntimeMacro);
  const assign = useEditor((s) => s.assign);
  const toast = useEditor((s) => s.toast);
  const ctx = useDisplayCtx();
  const rt = kb.runtime;
  const [slot, setSlot] = useState(initialSlot ?? 0);
  if (!project || !rt || !ctx) return null;
  const macros = readMacros(project, rt);
  return (
    <Modal open onClose={onClose} title="マクロ (即時編集)" wide>
      <p className="mb-3 rounded-lg bg-surface-2 p-2.5 text-xs text-muted">
        登録したキー入力を順番に実行します (最大 {rt.macroSteps} ステップ・{rt.macroSlots} 個)。作成・編集・削除は「キーボードに適用」でキーボードに直接書き込まれ、すぐに反映されます (UF2 の書き込みは不要)。
      </p>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {macros.map((m) => (
            <button
              key={m.slot}
              className={clsx('w-full rounded-lg border px-2.5 py-2 text-left', slot === m.slot ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}
              onClick={() => setSlot(m.slot)}
            >
              <div className="truncate text-sm font-medium">{m.steps.length ? m.name : `(空き) スロット ${m.slot + 1}`}</div>
              <div className="truncate text-xs text-muted">
                &amp;rtm{m.slot} ・ {m.steps.length ? `${m.steps.length} ステップ` : '未使用'}
              </div>
            </button>
          ))}
        </div>
        <RuntimeMacroEditor
          key={`${slot}-${macros[slot].steps.length}-${macros[slot].name}`}
          macro={macros[slot]}
          maxSteps={rt.macroSteps}
          ctx={ctx}
          onSave={(name, steps) => {
            save(slot, name, steps);
            toast('success', steps.length ? `マクロ「${name}」を保存しました。「キーボードに適用」で反映されます` : 'マクロを削除しました');
          }}
          onAssign={() => {
            if (!selected.length) return toast('info', '先にキーボード上のキーを選択してください');
            assign({ b: `${rt.macroBehaviorPrefix}${slot}`, p: [] }, `マクロ「${macros[slot].name}」を割り当て`);
            toast('success', `マクロを ${selected.length} 個のキーに割り当てました`);
          }}
        />
      </div>
    </Modal>
  );
}

function RuntimeMacroEditor({
  macro,
  maxSteps,
  ctx,
  onSave,
  onAssign,
}: {
  macro: RuntimeMacro;
  maxSteps: number;
  ctx: DisplayContext;
  onSave: (name: string, steps: Binding[]) => void;
  onAssign: () => void;
}) {
  const [name, setName] = useState(macro.steps.length ? macro.name : `マクロ ${macro.slot + 1}`);
  const [steps, setSteps] = useState<Binding[]>(macro.steps);
  const [draft, setDraft] = useState<Binding>({ b: 'kp', p: [KEYCODES.find((k) => k.names.includes('A'))!.value] });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };
  const allowStep = (b: Binding) => (ENCODER_ALLOWED_BEHAVIORS.has(b.b) || /^sc_/.test(b.b) ? null : `&${b.b} はマクロのステップには使えません (押して離すだけの動作のみ)`);
  return (
    <div className="min-w-0 space-y-3">
      <div>
        <label className="label">マクロ名</label>
        <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">実行する順番 ({steps.length} / {maxSteps})</label>
        <ol className="space-y-1">
          {steps.map((b, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm">
              <span className="w-5 text-xs text-muted">{i + 1}</span>
              <span className="flex-1 truncate font-medium">{describeSensorAction(b, ctx)}</span>
              <button className="btn-ghost p-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上へ">
                <ArrowUp size={13} />
              </button>
              <button className="btn-ghost p-1" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="下へ">
                <ArrowDown size={13} />
              </button>
              <button className="btn-ghost p-1 text-danger" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label="削除">
                <X size={13} />
              </button>
            </li>
          ))}
          {!steps.length && <li className="text-xs text-muted">ステップがありません。下から追加してください。</li>}
        </ol>
      </div>
      {steps.length < maxSteps && (
        <div className="rounded-lg border border-dashed border-line p-3">
          <div className="label">追加するキー入力</div>
          <BindingPicker value={draft} allow={allowStep} onChange={setDraft} />
          <button className="btn-outline mt-2" onClick={() => setSteps([...steps, draft])}>
            <Plus size={14} /> 「{describeSensorAction(draft, ctx)}」を追加
          </button>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {macro.steps.length > 0 && (
          <button className="btn-ghost text-danger" onClick={() => confirm('このマクロを削除しますか？割り当て済みのキーは何もしなくなります。') && onSave('', [])}>
            <Trash2 size={14} /> 削除
          </button>
        )}
        <button className="btn-outline" onClick={onAssign} disabled={!macro.steps.length}>
          選択中のキーに割り当て
        </button>
        <button className="btn-primary" disabled={!steps.length || !name.trim()} onClick={() => onSave(name.trim(), steps)}>
          保存
        </button>
      </div>
    </div>
  );
}
