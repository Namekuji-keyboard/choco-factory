import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search, Plus, Pencil, Trash2, Keyboard } from 'lucide-react';
import { useEditor } from '../state/editor';
import { useDevice, useRegistry } from '../state/device';
import type { Binding, MacroDef } from '../model/types';
import { KEYCODES, KEYCODE_CATEGORY_LABELS, keycodeLabel, keycodeSearchText, preferredName, type Keycode, type KeycodeCategory } from '../zmk/keycodes';
import { BT_COMMANDS, MOUSE_BUTTONS, MOUSE_MOVES, OUT_COMMANDS, mouseScrolls, type BehaviorDef } from '../zmk/behaviors';
import { scrollValFor } from '../state/editor';
import { MacroDialog } from './MacroDialog';
import { ShortcutsDialog } from './Features';
import { keycodeDescriptionJa } from '../zmk/keycodes.ja';
import { OS_LIST, absLayer, osSelectBinding, splitLayerIndex } from '../model/os';
import { SHORTCUT_PRESETS, presetKeys, resolveShortcut, shortcutText } from '../model/shortcuts';

type Tab =
  | 'basic'
  | 'symbols'
  | 'function'
  | 'modifiers'
  | 'navigation'
  | 'media'
  | 'keypad'
  | 'international'
  | 'apps'
  | 'taphold'
  | 'layers'
  | 'os'
  | 'shortcuts'
  | 'bluetooth'
  | 'mouse'
  | 'special'
  | 'macros'
  | 'other';

const TABS: { id: Tab; label: string; cats?: KeycodeCategory[] }[] = [
  { id: 'basic', label: '基本', cats: ['letters', 'numbers', 'basic'] },
  { id: 'symbols', label: '記号', cats: ['symbols'] },
  { id: 'function', label: 'F1〜F24', cats: ['function'] },
  { id: 'modifiers', label: '修飾キー', cats: ['modifiers'] },
  { id: 'navigation', label: '矢印・移動', cats: ['navigation'] },
  { id: 'media', label: 'メディア・音量', cats: ['media', 'volume'] },
  { id: 'shortcuts', label: 'ショートカット' },
  { id: 'taphold', label: 'Mod-Tap / Layer-Tap' },
  { id: 'layers', label: 'レイヤー' },
  { id: 'os', label: 'OS 切替' },
  { id: 'bluetooth', label: 'Bluetooth' },
  { id: 'macros', label: 'マクロ' },
  { id: 'mouse', label: 'マウス' },
  { id: 'special', label: '特殊' },
  { id: 'international', label: '日本語・国際', cats: ['international'] },
  { id: 'keypad', label: 'テンキー', cats: ['keypad'] },
  { id: 'apps', label: 'アプリ・システム', cats: ['apps', 'system'] },
  { id: 'other', label: 'その他', cats: ['other'] },
];

interface Item {
  key: string;
  label: string;
  sub?: string;
  title: string;
  binding?: Binding;
  keycode?: number;
  disabled?: boolean;
}

export function KeyPicker() {
  const [tab, setTab] = useState<Tab>('basic');
  const [query, setQuery] = useState('');
  const [macroEdit, setMacroEdit] = useState<MacroDef | null | 'new'>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const project = useEditor((s) => s.project);
  const layerIndex = useEditor((s) => s.layerIndex);
  const selected = useEditor((s) => s.selected);
  const pickerTarget = useEditor((s) => s.pickerTarget);
  const assign = useEditor((s) => s.assign);
  const setPickerTarget = useEditor((s) => s.setPickerTarget);
  const removeMacro = useEditor((s) => s.removeMacro);
  const host = useEditor((s) => s.settings.hostLayout);
  const toast = useEditor((s) => s.toast);
  const map = useDevice((s) => s.map);
  const registry = useRegistry();

  const searchIndex = useMemo(() => KEYCODES.map((k) => ({ k, text: keycodeSearchText(k) })), []);

  const onDevice = (label: string) => !map || map.byLabel.has(label);

  const keycodeItem = (k: Keycode): Item => ({
    key: `k${k.value}`,
    label: keycodeLabel(k.value, host),
    sub: preferredName(k),
    title: `${k.names.join(' / ')}\n${keycodeDescriptionJa(k)}`,
    keycode: k.value,
  });
  const behaviorItem = (b: Binding, label: string, sub: string, title: string): Item => ({
    key: `${b.b}-${b.p.join('-')}`,
    label,
    sub,
    title,
    binding: b,
    disabled: !onDevice(b.b),
  });

  const items: Item[] = useMemo(() => {
    if (!project) return [];
    const q = query.trim().toLowerCase();
    if (q) {
      const ks = searchIndex.filter((x) => q.split(/\s+/).every((w) => x.text.includes(w))).map((x) => keycodeItem(x.k));
      const bs = [...registry.values()]
        .filter((d) => d.params.length === 0 && `${d.label} ${d.nameJa} ${d.displayName} ${d.description}`.toLowerCase().includes(q))
        .map((d) => behaviorItem({ b: d.label, p: [] }, d.nameJa, `&${d.label}`, d.description));
      return [...bs, ...ks].slice(0, 300);
    }
    const t = TABS.find((x) => x.id === tab)!;
    if (t.cats) return KEYCODES.filter((k) => t.cats!.includes(k.category)).map(keycodeItem);
    // OS 別キーマップでは、表示中の OS のレイヤーだけを候補にする (OS 間で設定が混ざらないように)
    const os = project.os;
    const curOs = os ? splitLayerIndex(os, layerIndex).os : 0;
    const layers = os ? project.layers.slice(absLayer(os, curOs, 0), absLayer(os, curOs, os.layersPerOs)) : project.layers;
    const num = (i: number) => (os ? i : project.layers.indexOf(layers[i]));
    const sv = scrollValFor(project.keymapSource);
    switch (tab) {
      case 'layers':
        return layers.flatMap((l, i) => [
          behaviorItem({ b: 'mo', p: [l.id] }, `MO ${num(i)}`, l.name, `押している間「${l.name}」`),
          behaviorItem({ b: 'tog', p: [l.id] }, `TG ${num(i)}`, l.name, `「${l.name}」をオン/オフ`),
          behaviorItem({ b: 'to', p: [l.id] }, `TO ${num(i)}`, l.name, `「${l.name}」に切り替え (他のレイヤーはオフ)`),
          behaviorItem({ b: 'sl', p: [l.id] }, `SL ${num(i)}`, l.name, `次の1キーだけ「${l.name}」`),
        ]);
      case 'os':
        if (!os) return [];
        return OS_LIST.flatMap((o, i) => [
          behaviorItem(osSelectBinding(os, i, true), o.name, `BT${o.profile} + L${os.systems[i].defaultLayer}`, `${o.name} に切り替え: Bluetooth プロファイル ${o.profile} を選択し、${o.name} のデフォルトレイヤー (Layer ${os.systems[i].defaultLayer}) へ移動`),
          behaviorItem(osSelectBinding(os, i, false), `${o.short} (層のみ)`, `L${os.systems[i].defaultLayer}`, `${o.name} のデフォルトレイヤー (Layer ${os.systems[i].defaultLayer}) へ移動 (Bluetooth プロファイルは変えない)`),
        ]);
      case 'shortcuts': {
        const osId = os ? OS_LIST[curOs].id : 'windows';
        const own = (project.shortcuts ?? []).filter((x) => x.os === 'all' || x.os === osId);
        const ownItems = own.flatMap((x) => {
          const r = resolveShortcut(x);
          if (!r.binding) return [];
          return [behaviorItem(r.binding, x.name, shortcutText(x.keys, host), `${x.name}: ${shortcutText(x.keys, host)}${r.kind === 'macro' ? '\n(複数キーのマクロ。ファームウェアのビルドが必要)' : ''}${x.note ? `\n${x.note}` : ''}`)];
        });
        const presetItems = SHORTCUT_PRESETS[osId].flatMap((pr) => {
          const r = resolveShortcut({ id: pr.name, keys: presetKeys(pr) });
          if (r.kind !== 'kp' || !r.binding) return [];
          return [{ ...behaviorItem(r.binding, pr.name, shortcutText(presetKeys(pr), host), `${pr.name}: ${shortcutText(presetKeys(pr), host)}${pr.note ? `\n※ ${pr.note}` : ''}`), key: `preset-${pr.name}` }];
        });
        return [...ownItems, ...presetItems];
      }
      case 'taphold': {
        const A = KEYCODES.find((k) => k.names.includes('A'))!.value;
        const SPACE = KEYCODES.find((k) => k.names.includes('SPACE'))!.value;
        const mods = KEYCODES.filter((k) => k.category === 'modifiers');
        return [
          ...mods.map((m) => behaviorItem({ b: 'mt', p: [m.value, A] }, `MT ${keycodeLabel(m.value, host)}`, 'Mod-Tap', `ホールドで ${keycodeLabel(m.value, host)}、タップでキー (右のパネルで変更)`)),
          ...layers.slice(1).map((l, i) => behaviorItem({ b: 'lt', p: [l.id, SPACE] }, `LT ${num(i + 1)}`, l.name, `ホールドで「${l.name}」、タップでキー (右のパネルで変更)`)),
          ...MODIFIER_STICKY(host).map(([v, label]) => behaviorItem({ b: 'sk', p: [v] }, `SK ${label}`, 'スティッキー', `次の1キーだけ ${label} を押した状態にする`)),
        ];
      }
      case 'bluetooth':
        return [
          ...[0, 1, 2, 3, 4].map((n) => behaviorItem({ b: 'bt', p: [3, n] }, `BT ${n}`, 'プロファイル', `Bluetooth プロファイル ${n} を選択 (&bt BT_SEL ${n})`)),
          ...BT_COMMANDS.filter((c) => !c.needsArg).map((c) => behaviorItem({ b: 'bt', p: [c.value, 0] }, c.label, c.name, `&bt ${c.name}`)),
          ...OUT_COMMANDS.map((c) => behaviorItem({ b: 'out', p: [c.value] }, c.label, c.name, `&out ${c.name}`)),
        ];
      case 'mouse':
        return [
          ...MOUSE_BUTTONS.map((c) => behaviorItem({ b: 'mkp', p: [c.value] }, c.label, c.name, `&mkp ${c.name}`)),
          ...MOUSE_MOVES.map((c) => behaviorItem({ b: 'mmv', p: [c.value] }, c.label, c.name, `&mmv ${c.name}`)),
          ...mouseScrolls(sv).map((c) => behaviorItem({ b: 'msc', p: [c.value] }, c.label, c.name, `&msc ${c.name}`)),
        ];
      case 'special':
        return [...registry.values()]
          .filter((d) => !d.custom && d.params.length === 0)
          .map((d) => behaviorItem({ b: d.label, p: [] }, d.nameJa, `&${d.label}`, d.description));
      case 'macros':
        return [...registry.values()]
          .filter((d) => d.custom && !/^sc_/.test(d.label))
          .map((d) => behaviorItem({ b: d.label, p: d.params.map(() => 0) }, d.nameJa, `&${d.label}`, `${d.description}${d.params.length ? '\nパラメータは右のパネルで設定' : ''}`));
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query, project, registry, host, map]);

  if (!project) return null;
  const layer = project.layers[layerIndex];
  const primary = selected.length ? layer.bindings[selected[selected.length - 1]] : null;
  const targetDef: BehaviorDef | undefined = primary ? registry.get(primary.b) : undefined;
  const targetKind = pickerTarget !== null && targetDef ? targetDef.params[pickerTarget] : undefined;

  const pick = (item: Item) => {
    if (!selected.length) {
      toast('info', '先にキーボード上のキーを選択してください');
      return;
    }
    if (item.disabled) {
      toast('error', 'このビヘイビアは接続中のキーボードのファームウェアに含まれていません');
      return;
    }
    if (item.keycode !== undefined) {
      // パラメータ選択中 (Mod-Tap のタップキーなど) ならそのパラメータを変更
      if (primary && pickerTarget !== null && (targetKind === 'keycode' || targetKind === 'modifier')) {
        const p = [...primary.p];
        p[pickerTarget] = item.keycode;
        assign({ b: primary.b, p }, `${item.label} を設定`);
        setPickerTarget(null);
        return;
      }
      assign({ b: 'kp', p: [item.keycode] }, `${item.label} を割り当て`);
      return;
    }
    if (item.binding) assign(item.binding, `${item.label} を割り当て`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <input className="input pl-8" placeholder="キーコードを検索 (例: enter, 音量, F13, かな)" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {pickerTarget !== null && targetDef && (
          <span className="rounded-md bg-accent-soft px-2 py-1 text-xs text-accent">
            「{targetDef.paramNames?.[pickerTarget] ?? 'キー'}」を選択中 —
            <button className="ml-1 underline" onClick={() => setPickerTarget(null)}>
              解除
            </button>
          </span>
        )}
        {!selected.length && <span className="text-xs text-muted">キーを選択するとここから割り当てられます</span>}
      </div>
      {!query && (
        <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx('shrink-0 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors', tab === t.id ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'macros' && !query && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">
            <span className="flex-1">
              マクロの作成・変更はファームウェアの再ビルドが必要です (ZMK Studio はマクロの編集に未対応)。作成したマクロは「ファイル」→ ZIP 出力に含まれます。
            </span>
            <button className="btn-outline py-1 text-xs" onClick={() => setMacroEdit('new')}>
              <Plus size={13} /> マクロを作成
            </button>
          </div>
        )}
        {tab === 'macros' && !query && project.macros.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {project.macros.map((m) => (
              <span key={m.label} className="chip gap-1.5">
                {m.name}
                <button title="編集" onClick={() => setMacroEdit(m)}>
                  <Pencil size={12} />
                </button>
                <button title="削除" onClick={() => confirm(`マクロ「${m.name}」を削除しますか？割り当て済みのキーは「なし」になります。`) && removeMacro(m.label)}>
                  <Trash2 size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {tab === 'shortcuts' && !query && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">
            <span className="flex-1">
              表示中の OS のショートカット (登録したもの → よく使うプリセットの順)。修飾キー + 1 キーはそのままキーボードに書き込めます。通常キーを 2 個以上同時に押すものはマクロになり、ファームウェアのビルドが必要です。OS やアプリによって動作が異なる場合があります。
            </span>
            <button className="btn-outline py-1 text-xs" onClick={() => setShortcutsOpen(true)}>
              <Keyboard size={13} /> ショートカットを管理
            </button>
          </div>
        )}
        {tab === 'os' && !query && (
          <p className="mb-3 text-xs text-muted">
            OS 切替キー: Bluetooth プロファイルの切り替えと、その OS のデフォルトレイヤーへの移動を 1 回の押下で行います (&amp;os_sel)。「層のみ」は Bluetooth プロファイルを変えずにレイヤーだけ切り替えます (&amp;os_to)。Bluetooth だけを切り替えるキーは「Bluetooth」タブにあります。
          </p>
        )}
        {tab === 'taphold' && !query && (
          <p className="mb-3 text-xs text-muted">ボタンで Mod-Tap / Layer-Tap を割り当てたあと、右のパネルでタップ時のキーやレイヤーを変更できます。</p>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
          {items.map((it) => (
            <button
              key={it.key}
              title={it.title + (it.disabled ? '\n(接続中のキーボードには未搭載)' : '')}
              onClick={() => pick(it)}
              className={clsx(
                'keycap relative flex h-14 flex-col items-center justify-center rounded-lg px-1 text-center',
                it.disabled && 'opacity-40',
              )}
            >
              <span className="max-w-full truncate text-sm leading-tight font-semibold">{it.label}</span>
              {it.sub && <span className="mt-0.5 max-w-full truncate font-mono text-[9px] text-muted">{it.sub}</span>}
            </button>
          ))}
          {!items.length && <p className="col-span-full py-6 text-center text-sm text-muted">該当するキーコードがありません</p>}
        </div>
        {(tab === 'other' || tab === 'apps') && !query && (
          <p className="mt-3 text-xs text-muted">※ OS によっては動作しないキーコードがあります。詳しくは ZMK のキーコード一覧を参照してください。</p>
        )}
        <p className="mt-3 text-[11px] text-muted">{KEYCODE_CATEGORY_LABELS.letters} などの表示は「設定」の「PC のキーボード配列」(JIS / US) に合わせて表示しています。</p>
      </div>
      {macroEdit && <MacroDialog macro={macroEdit === 'new' ? null : macroEdit} onClose={() => setMacroEdit(null)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

const MODIFIER_STICKY = (host: 'us' | 'jis'): [number, string][] =>
  ['LSHFT', 'LCTRL', 'LALT', 'LGUI'].map((n) => {
    const k = KEYCODES.find((x) => x.names.includes(n))!;
    return [k.value, keycodeLabel(k.value, host)];
  });
