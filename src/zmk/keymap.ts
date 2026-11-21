import type { Binding, ComboDef, KeyboardDefinition, Layer, MacroDef, SensorBinding } from '../model/types';
import {
  BL_COMMANDS,
  BT_COMMANDS,
  BUILTIN_BEHAVIORS,
  EP_COMMANDS,
  MOUSE_BUTTONS,
  MOUSE_MOVES,
  OUT_COMMANDS,
  RGB_COMMANDS,
  mouseScrolls,
  paramsForCompatible,
  type BehaviorDef,
  type ParamKind,
} from './behaviors';
import { findProp, groupBindings, parseDts, stringProp, tokenizeCells, walk, type DtsNode, type DtsProp } from './dts';
import { ZMK_HEADER_DEFINES } from './headers.generated';
import { KEYCODES, formatKeycode } from './keycodes';
import { evaluateParams, expandMacros, parseDefines, splitCells, evalIntExpr, type MacroTable } from './preprocessor';

// ---------------------------------------------------------------------------
// マクロ環境 (ZMK ヘッダ + keys.h + キーマップ内の #define)
// ---------------------------------------------------------------------------

let baseMacros: MacroTable | null = null;
function getBaseMacros(): MacroTable {
  if (baseMacros) return baseMacros;
  const m = parseDefines(ZMK_HEADER_DEFINES);
  for (const k of KEYCODES) {
    for (const n of k.names) m.set(n, { body: `0x${k.value.toString(16)}` });
  }
  baseMacros = m;
  return m;
}

export function buildMacros(keymapText: string): MacroTable {
  return parseDefines(keymapText, new Map(getBaseMacros()));
}

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------

export interface ParsedBinding {
  behavior: string;
  params: string[];
  /** 元のテキスト (空白を1つに正規化) */
  text: string;
}

export interface ParsedLayer {
  node: DtsNode;
  nodeName: string;
  displayName?: string;
  bindingsProp?: DtsProp;
  bindings: ParsedBinding[];
  sensorBindings?: string;
  sensorBindingsProp?: DtsProp;
  /** sensor-bindings を解析できた場合の割り当て */
  sensors?: SensorBinding[];
}

export interface ParsedKeymap {
  text: string;
  roots: DtsNode[];
  macros: MacroTable;
  keymapNode: DtsNode;
  layers: ParsedLayer[];
  reservedLayers: DtsNode[];
  customBehaviors: BehaviorDef[];
  macrosNode?: DtsNode;
  /** マウススクロールの既定量 (キーマップで上書きされていればその値) */
  scrollVal: number;
  /** zmk,behavior-sensor-rotate のビヘイビア (ラベル → 時計回り / 反時計回り) */
  sensorRotates: Map<string, SensorBinding>;
  behaviorsNode?: DtsNode;
  combosNode?: DtsNode;
  combos: ComboDef[];
  /** ファイル内で定義されているすべてのラベル */
  labels: Set<string>;
}

const parseCache = new Map<string, ParsedKeymap>();

/** キーマップを解析 (同じテキストの結果はキャッシュ。結果は書き換えないこと) */
export function parseKeymap(text: string): ParsedKeymap {
  const hit = parseCache.get(text);
  if (hit) return hit;
  const result = parseKeymapUncached(text);
  parseCache.set(text, result);
  if (parseCache.size > 8) parseCache.delete(parseCache.keys().next().value!);
  return result;
}

function parseKeymapUncached(text: string): ParsedKeymap {
  const roots = parseDts(text);
  const macros = buildMacros(text);

  let keymapNode: DtsNode | undefined;
  let macrosNode: DtsNode | undefined;
  let behaviorsNode: DtsNode | undefined;
  let combosNode: DtsNode | undefined;
  const behaviorNodes: DtsNode[] = [];
  const sensorNodes: DtsNode[] = [];
  const labels = new Set<string>();
  walk(roots, (n) => {
    const compat = stringProp(n, 'compatible');
    n.labels.forEach((l) => labels.add(l));
    if (compat === 'zmk,keymap') keymapNode = n;
    if (compat === 'zmk,combos' && !combosNode) combosNode = n;
    if (n.name === 'macros' && !macrosNode) macrosNode = n;
    if (n.name === 'behaviors' && !compat && !behaviorsNode) behaviorsNode = n;
    if (compat === 'zmk,behavior-sensor-rotate' && n.labels.length) sensorNodes.push(n);
    if (compat?.startsWith('zmk,behavior-') && n.labels.length && findProp(n, '#binding-cells')) behaviorNodes.push(n);
  });
  if (!keymapNode) throw new Error('キーマップ (compatible = "zmk,keymap") が見つかりません');

  const builtinLabels = new Set(BUILTIN_BEHAVIORS.map((b) => b.label));
  const customBehaviors: BehaviorDef[] = [];
  const pending: { def: BehaviorDef; children: string[]; cells: number }[] = [];
  for (const n of behaviorNodes) {
    const label = n.labels[0];
    if (builtinLabels.has(label)) continue;
    const compatible = stringProp(n, 'compatible')!;
    const cellsProp = findProp(n, '#binding-cells')?.value ?? '<0>';
    const cells = parseInt(/\d+/.exec(cellsProp)?.[0] ?? '0', 10);
    const displayName = stringProp(n, 'display-name');
    const labelProp = stringProp(n, 'label');
    const children = n.props.find((p) => p.name === 'bindings')?.value;
    const childLabels = children ? groupBindings(tokenizeCells(children)).map((g) => g.behavior) : [];
    const isMacro = compatible.startsWith('zmk,behavior-macro');
    const def: BehaviorDef = {
      label,
      displayName: displayName ?? labelProp ?? n.name,
      nameJa: displayName ?? label,
      description: isMacro ? 'キーマップで定義されたマクロ' : `キーマップで定義されたビヘイビア (${compatible.replace('zmk,behavior-', '')})`,
      params: [],
      group: 'custom',
      custom: true,
      aliases: [n.name, ...(labelProp ? [labelProp] : []), ...(displayName ? [displayName] : [])],
      compatible,
    };
    customBehaviors.push(def);
    pending.push({ def, children: childLabels, cells });
  }
  const registry = new Map<string, BehaviorDef>([...BUILTIN_BEHAVIORS, ...customBehaviors].map((b) => [b.label, b]));
  for (const { def, children, cells } of pending) {
    const childParams = children.map((c) => registry.get(c)?.params ?? []);
    def.params = paramsForCompatible(def.compatible!, cells, childParams);
  }

  // エンコーダー用ビヘイビア (sensor-rotate)
  const sensorRotates = new Map<string, SensorBinding>();
  for (const n of sensorNodes) {
    const v = findProp(n, 'bindings')?.value;
    const groups = v ? groupBindings(tokenizeCells(v)) : [];
    if (groups.length !== 2) continue;
    const [cw, ccw] = groups.map((g) => toBinding({ behavior: g.behavior, params: g.params, text: '' }, macros));
    sensorRotates.set(n.labels[0], { cw, ccw });
  }

  const layers: ParsedLayer[] = [];
  const reservedLayers: DtsNode[] = [];
  for (const child of keymapNode.children) {
    if (stringProp(child, 'status') === 'reserved') {
      reservedLayers.push(child);
      continue;
    }
    const bindingsProp = findProp(child, 'bindings');
    const groups = bindingsProp?.value ? groupBindings(tokenizeCells(bindingsProp.value)) : [];
    layers.push({
      node: child,
      nodeName: child.name,
      displayName: stringProp(child, 'display-name') ?? stringProp(child, 'label'),
      bindingsProp,
      bindings: groups.map((g) => ({ behavior: g.behavior, params: g.params, text: ['&' + g.behavior, ...g.params].join(' ') })),
      sensorBindings: findProp(child, 'sensor-bindings')?.value?.trim(),
      sensorBindingsProp: findProp(child, 'sensor-bindings'),
    });
    const last = layers[layers.length - 1];
    if (last.sensorBindings) last.sensors = parseSensorBindings(last.sensorBindings, sensorRotates, macros);
  }

  // 外部モジュール (#include で読み込まれる dtsi) のビヘイビア: 使われ方からパラメータ数を推定して登録
  // 例: zmk-rgbled-widget の &ind_bat
  const knownLabels = new Set([...BUILTIN_BEHAVIORS, ...customBehaviors].map((b) => b.label));
  for (const l of layers) {
    for (const b of l.bindings) {
      if (knownLabels.has(b.behavior)) continue;
      knownLabels.add(b.behavior);
      customBehaviors.push({
        label: b.behavior,
        displayName: b.behavior,
        nameJa: b.behavior,
        description: '外部モジュールで定義されたビヘイビア',
        params: b.params.map(() => 'number' as ParamKind),
        group: 'custom',
        custom: true,
        aliases: [b.behavior],
      });
    }
  }

  let scrollVal = 10;
  try {
    scrollVal = evalIntExpr(expandMacros('ZMK_POINTING_DEFAULT_SCRL_VAL', macros));
  } catch {
    /* 既定値のまま */
  }

  // コンボ
  const combos: ComboDef[] = [];
  for (const c of combosNode?.children ?? []) {
    const kp = findProp(c, 'key-positions')?.value;
    const bp = findProp(c, 'bindings')?.value;
    if (!kp || !bp) continue;
    const g = groupBindings(tokenizeCells(bp))[0];
    if (!g) continue;
    let positions: number[] = [];
    let layerIds: number[] = [];
    try {
      positions = splitCells(expandMacros(kp.replace(/[<>]/g, ' '), macros)).map(evalIntExpr);
      const lp = findProp(c, 'layers')?.value;
      layerIds = lp ? splitCells(expandMacros(lp.replace(/[<>]/g, ' '), macros)).map(evalIntExpr) : [];
    } catch {
      continue;
    }
    const tm = findProp(c, 'timeout-ms')?.value;
    combos.push({
      id: `file-${c.name}`,
      name: c.name,
      positions,
      binding: toBinding({ behavior: g.behavior, params: g.params, text: '' }, macros),
      layers: layerIds,
      timeoutMs: tm ? parseInt(/\d+/.exec(tm)?.[0] ?? '50', 10) : 50,
    });
  }

  return { text, roots, macros, keymapNode, layers, reservedLayers, customBehaviors, macrosNode, scrollVal, sensorRotates, behaviorsNode, combosNode, combos, labels };
}

const TRANS_BINDING: Binding = { b: 'trans', p: [] };

function parseSensorBindings(text: string, rotates: Map<string, SensorBinding>, macros: MacroTable): SensorBinding[] | undefined {
  const out: SensorBinding[] = [];
  for (const g of groupBindings(tokenizeCells(text))) {
    if (g.behavior === 'trans' && !g.params.length) out.push({ cw: { ...TRANS_BINDING }, ccw: { ...TRANS_BINDING } });
    else if (rotates.has(g.behavior) && !g.params.length) {
      const r = rotates.get(g.behavior)!;
      out.push({ cw: { ...r.cw, p: [...r.cw.p] }, ccw: { ...r.ccw, p: [...r.ccw.p] } });
    } else if (g.behavior === 'inc_dec_kp' && g.params.length === 2) {
      try {
        const [a, b] = evaluateParams(g.params, macros);
        out.push({ cw: { b: 'kp', p: [a] }, ccw: { b: 'kp', p: [b] } });
      } catch {
        return undefined;
      }
    } else return undefined;
  }
  return out;
}

/** エンコーダーの割り当てが同じか (省略された末尾のエンコーダー・sensor-bindings 無しは「透過」として比較) */
export function sensorsEqual(a?: SensorBinding[], b?: SensorBinding[]): boolean {
  const x = a ?? [];
  const y = b ?? [];
  const T = { cw: TRANS_BINDING, ccw: TRANS_BINDING };
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? T;
    const q = y[i] ?? T;
    if (!bindingsEqual(p.cw, q.cw) || !bindingsEqual(p.ccw, q.ccw)) return false;
  }
  return true;
}

export function behaviorRegistry(custom: BehaviorDef[] = []): Map<string, BehaviorDef> {
  return new Map([...BUILTIN_BEHAVIORS, ...custom].map((b) => [b.label, b]));
}

/** 解析済みバインディングを数値モデルに変換 (レイヤー番号はそのままレイヤー ID とみなす) */
export function toBinding(pb: ParsedBinding, macros: MacroTable): Binding {
  try {
    const p = evaluateParams(pb.params, macros);
    return { b: pb.behavior, p };
  } catch {
    return { b: pb.behavior, p: [], raw: pb.params.join(' ') };
  }
}

export function layersFromParsed(parsed: ParsedKeymap): Layer[] {
  return parsed.layers.map((l, i) => ({
    id: i,
    name: l.displayName ?? `Layer ${i}`,
    bindings: l.bindings.map((b) => toBinding(b, parsed.macros)),
    ...(l.sensors ? { sensors: l.sensors.map((x) => ({ cw: { ...x.cw, p: [...x.cw.p] }, ccw: { ...x.ccw, p: [...x.ccw.p] } })) } : {}),
  }));
}

// ---------------------------------------------------------------------------
// 整形 (数値モデル → キーマップ表記)
// ---------------------------------------------------------------------------

export interface FormatContext {
  behaviors: Map<string, BehaviorDef>;
  /** レイヤー ID → 出力するキーマップ上の番号 */
  layerIndexById?: Map<number, number>;
  scrollVal?: number;
}

const signed16 = (v: number) => ((v & 0xffff) << 16) >> 16;

export function formatParam(kind: ParamKind, value: number, ctx: FormatContext): string {
  switch (kind) {
    case 'keycode':
    case 'modifier':
      return formatKeycode(value);
    case 'layer':
      return String(ctx.layerIndexById?.get(value) ?? value);
    case 'out_cmd':
      return OUT_COMMANDS.find((c) => c.value === value)?.name ?? String(value);
    case 'ep_cmd':
      return EP_COMMANDS.find((c) => c.value === value)?.name ?? String(value);
    case 'mouse_button':
      return MOUSE_BUTTONS.find((c) => c.value === value)?.name ?? String(value);
    case 'mouse_move': {
      const named = MOUSE_MOVES.find((c) => c.value === value >>> 0);
      return named ? named.name : `MOVE(${signed16(value >>> 16)}, ${signed16(value)})`;
    }
    case 'mouse_scroll': {
      const named = mouseScrolls(ctx.scrollVal ?? 10).find((c) => c.value === value >>> 0);
      return named ? named.name : `MOVE(${signed16(value >>> 16)}, ${signed16(value)})`;
    }
    default:
      return String(value >>> 0);
  }
}

export function formatBinding(binding: Binding, ctx: FormatContext): string {
  if (binding.raw !== undefined) return `&${binding.b}${binding.raw ? ' ' + binding.raw : ''}`;
  const def = ctx.behaviors.get(binding.b);
  const p = binding.p;
  const head = `&${binding.b}`;
  if (!def || def.params.length !== p.length) {
    return [head, ...p.map((v) => String(v >>> 0))].join(' ');
  }
  // コマンド + 引数の組み合わせ
  const k0 = def.params[0];
  if (k0 === 'bt_cmd') {
    const cmd = BT_COMMANDS.find((c) => c.value === p[0]);
    if (cmd?.needsArg) return `${head} ${cmd.name} ${p[1]}`;
    if (cmd && p[1] === 0) return `${head} ${cmd.name}`;
    return `${head} ${p[0]} ${p[1]}`;
  }
  if (k0 === 'rgb_cmd') {
    if (p[0] === 14) return `${head} RGB_COLOR_HSB(${(p[1] >>> 16) & 0xffff}, ${(p[1] >>> 8) & 0xff}, ${p[1] & 0xff})`;
    const cmd = RGB_COMMANDS.find((c) => c.value === p[0]);
    if (cmd && p[1] === 0) return `${head} ${cmd.name}`;
    return `${head} ${p[0]} ${p[1]}`;
  }
  if (k0 === 'bl_cmd') {
    const cmd = BL_COMMANDS.find((c) => c.value === p[0]);
    if (cmd?.needsArg) return `${head} ${cmd.name} ${p[1]}`;
    if (cmd && p[1] === 0) return `${head} ${cmd.name}`;
    return `${head} ${p[0]} ${p[1]}`;
  }
  return [head, ...def.params.map((k, i) => formatParam(k, p[i], ctx))].join(' ');
}

export function bindingsEqual(a: Binding, b: Binding): boolean {
  if (a.b !== b.b) return false;
  if ((a.raw ?? null) !== (b.raw ?? null)) return false;
  if (a.p.length !== b.p.length) return false;
  return a.p.every((v, i) => v >>> 0 === b.p[i] >>> 0);
}

/** レイヤー ID を出力用の番号に置き換えたバインディング */
function remapLayers(b: Binding, def: BehaviorDef | undefined, map: Map<number, number>): Binding {
  if (!def || b.raw !== undefined || def.params.length !== b.p.length) return b;
  if (!def.params.includes('layer')) return b;
  return { ...b, p: b.p.map((v, i) => (def.params[i] === 'layer' ? (map.get(v) ?? v) : v)) };
}

/** キーボードの行・左右構成に合わせてバインディングを桁揃えして並べる */
export function formatGrid(cells: string[], kb: Pick<KeyboardDefinition, 'rowSizes' | 'leftCounts'>): string {
  const rows: { left: string[]; right: string[] }[] = [];
  let k = 0;
  kb.rowSizes.forEach((size, r) => {
    const row = cells.slice(k, k + size);
    k += size;
    const lc = kb.leftCounts[r] ?? size;
    rows.push({ left: row.slice(0, lc), right: row.slice(lc) });
  });
  if (k < cells.length) rows.push({ left: cells.slice(k), right: [] });
  const leftW: number[] = [];
  const rightW: number[] = [];
  for (const r of rows) {
    r.left.forEach((c, i) => (leftW[i] = Math.max(leftW[i] ?? 0, c.length)));
    r.right.forEach((c, i) => {
      const j = r.right.length - 1 - i; // 右端から揃える
      rightW[j] = Math.max(rightW[j] ?? 0, c.length);
    });
  }
  const leftTotal = leftW.reduce((a, w) => a + w + 2, 0);
  return rows
    .map((r) => {
      let line = r.left.map((c, i) => c.padEnd(leftW[i] + 2)).join('');
      line = line.padEnd(leftTotal + 2);
      const rightMax = rightW.length;
      // 右手側は右端揃え: 足りない列分のスペースを先頭に入れる
      let pre = '';
      for (let j = rightMax - 1; j >= r.right.length; j--) pre += ' '.repeat(rightW[j] + 2);
      line += pre + r.right.map((c, i) => c.padEnd(rightW[r.right.length - 1 - i] + 2)).join('');
      return line.trimEnd();
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// エクスポート (元ファイルの必要な部分だけを書き換える)
// ---------------------------------------------------------------------------

export interface ExportResult {
  text: string;
  warnings: string[];
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

function lineIndent(text: string, offset: number): string {
  const ls = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(ls))![0];
}

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export interface ExportOptions {
  /** コンボ (undefined = ファイルの記述をそのまま使う) */
  combos?: ComboDef[];
  /** ショートカットなど、このアプリで定義を追加するビヘイビア */
  extraBehaviors?: BehaviorDef[];
  /** OS 切替マクロ (&os_sel / &os_to) を常に含める */
  osMacros?: boolean;
}

const indentBlock = (text: string, indent: string) =>
  text
    .split('\n')
    .map((l) => (l ? indent + l : l))
    .join('\n');

export function exportKeymap(
  source: string,
  layers: Layer[],
  kb: Pick<KeyboardDefinition, 'rowSizes' | 'leftCounts'>,
  macros: MacroDef[] = [],
  opts: ExportOptions = {},
): ExportResult {
  const parsed = parseKeymap(source);
  const warnings: string[] = [];
  const extra = opts.extraBehaviors ?? [];
  const registry = behaviorRegistry([...parsed.customBehaviors, ...macros.map(macroBehavior), ...extra]);
  const layerIndexById = new Map(layers.map((l, i) => [l.id, i]));
  const ctx: FormatContext = { behaviors: registry, layerIndexById, scrollVal: parsed.scrollVal };
  const edits: Edit[] = [];
  const text = parsed.text;
  const used = new Set<string>();
  const fmt = (b: Binding) => {
    used.add(b.b);
    return formatBinding(remapLayers(b, registry.get(b.b), layerIndexById), ctx);
  };

  // 存在しないレイヤーを参照していないか
  layers.forEach((l) =>
    l.bindings.forEach((b, pos) => {
      const def = registry.get(b.b);
      if (!def) warnings.push(`${l.name} のキー ${pos + 1}: ビヘイビア &${b.b} はキーマップ内で定義されていません (外部モジュールのものなら問題ありません)`);
      def?.params.forEach((k, i) => {
        if (k === 'layer' && b.p[i] !== undefined && !layerIndexById.has(b.p[i])) {
          warnings.push(`${l.name} のキー ${pos + 1}: 存在しないレイヤー (ID ${b.p[i]}) を参照しています`);
        }
      });
    }),
  );

  // ---- エンコーダー (sensor-bindings) ----
  const rotateNodes: string[] = [];
  const rotateLabels = new Map<string, string>(); // 内容 → ラベル
  for (const [label, r] of parsed.sensorRotates) rotateLabels.set(`${fmt(r.cw)}|${fmt(r.ccw)}`, label);
  let encCounter = 0;
  /**
   * sensor-bindings の出力。ZMK v0.2.1 では sensor-bindings に &trans を書けない (sensor 用のビヘイビアではない) ため、
   * 透過は「末尾のエンコーダーを省略する / sensor-bindings 自体を書かない」ことで表す。
   * 戻り値: 出力する値 (例: " <&enc_1>, <&enc_2>")、null = sensor-bindings を書かない (すべて透過)
   */
  const sensorText = (layer: Layer): string | null => {
    const list = layer.sensors ?? [];
    const isTrans = (sb: SensorBinding) => sb.cw.b === 'trans' && sb.ccw.b === 'trans';
    let n = list.length;
    while (n > 0 && isTrans(list[n - 1])) n--;
    if (n === 0) return null;
    const parts = list.slice(0, n).map((sb, idx) => {
      let { cw, ccw } = sb;
      if (cw.b === 'trans' || ccw.b === 'trans') {
        warnings.push(
          isTrans(sb)
            ? `${layer.name} のエンコーダー ${idx}: 後ろのエンコーダーが透過でないため、このエンコーダーだけを透過にはできません。「なし」として出力しました`
            : `${layer.name} のエンコーダー ${idx}: 片方の回転方向だけを透過にはできないため「なし」として出力しました`,
        );
        if (cw.b === 'trans') cw = { b: 'none', p: [] };
        if (ccw.b === 'trans') ccw = { b: 'none', p: [] };
      }
      const key = `${fmt(cw)}|${fmt(ccw)}`;
      let label = rotateLabels.get(key);
      if (!label) {
        do label = `enc_${++encCounter}`;
        while (parsed.labels.has(label));
        rotateLabels.set(key, label);
        rotateNodes.push(
          [
            `${label}: ${label} {`,
            `    compatible = "zmk,behavior-sensor-rotate";`,
            `    #sensor-binding-cells = <0>;`,
            `    bindings = <${fmt(cw)}>, <${fmt(ccw)}>; // 時計回り, 反時計回り`,
            `    tap-ms = <20>;`,
            `};`,
          ].join('\n'),
        );
      }
      return `<&${label}>`;
    });
    return ' ' + parts.join(', ');
  };

  layers.forEach((layer, i) => {
    const src = parsed.layers[i];
    if (!src) return;
    // 名前
    const srcName = src.displayName ?? `Layer ${i}`;
    if (layer.name !== srcName) {
      const dn = findProp(src.node, 'display-name');
      if (dn) {
        edits.push({ start: dn.valueStart, end: dn.valueEnd, text: ` ${quote(layer.name)}` });
      } else {
        const anchor = src.bindingsProp ?? src.node.props[0];
        const at = anchor ? text.lastIndexOf('\n', anchor.start) + 1 : src.node.bodyStart;
        const indent = anchor ? lineIndent(text, anchor.start) : '            ';
        edits.push({ start: at, end: at, text: `${indent}display-name = ${quote(layer.name)};\n` });
      }
    }
    // バインディング
    const srcBindings = src.bindings.map((b) => toBinding(b, parsed.macros));
    const out = layer.bindings.map((b, pos) => {
      used.add(b.b);
      const fileLevel = remapLayers(b, registry.get(b.b), layerIndexById);
      const orig = srcBindings[pos];
      if (orig && bindingsEqual(fileLevel, orig)) return src.bindings[pos].text;
      return formatBinding(fileLevel, ctx);
    });
    const unchanged = out.length === src.bindings.length && out.every((t, pos) => t === src.bindings[pos].text);
    if (!unchanged) {
      const value = ` <\n${formatGrid(out, kb)}\n${lineIndent(text, src.bindingsProp?.start ?? src.node.start)}>`;
      if (src.bindingsProp) edits.push({ start: src.bindingsProp.valueStart, end: src.bindingsProp.valueEnd, text: value });
    }
    // エンコーダー
    if (layer.sensors && !(src.sensors && sensorsEqual(layer.sensors, src.sensors))) {
      const st = sensorText(layer);
      if (st === null) {
        // すべて透過: sensor-bindings を削除
        const sp = src.sensorBindingsProp;
        if (sp) {
          const ls = text.lastIndexOf('\n', sp.start - 1);
          edits.push({ start: ls >= 0 ? ls : sp.start, end: sp.end, text: '' });
        }
      } else {
        if (src.sensorBindingsProp) edits.push({ start: src.sensorBindingsProp.valueStart, end: src.sensorBindingsProp.valueEnd, text: st });
        else {
          const at = src.node.bodyEnd;
          const indent = lineIndent(text, src.node.start) + '    ';
          edits.push({ start: at, end: at, text: `\n${indent}sensor-bindings =${st};\n${lineIndent(text, src.node.start)}` });
        }
      }
    }
  });

  // 削除されたレイヤー
  for (let i = layers.length; i < parsed.layers.length; i++) {
    const n = parsed.layers[i].node;
    const ls = text.lastIndexOf('\n', n.start - 1);
    edits.push({ start: ls >= 0 ? ls : n.start, end: n.end, text: '' });
  }

  // 追加されたレイヤー
  if (layers.length > parsed.layers.length) {
    const last = parsed.layers[parsed.layers.length - 1]?.node;
    const at = last ? last.end : parsed.keymapNode.bodyStart;
    const indent = last ? lineIndent(text, last.start) : '        ';
    const usedNames = new Set(parsed.keymapNode.children.map((c) => c.name));
    let chunk = '';
    for (let i = parsed.layers.length; i < layers.length; i++) {
      let name = `layer_${i}`;
      while (usedNames.has(name)) name += '_';
      usedNames.add(name);
      const l = layers[i];
      const cells = l.bindings.map(fmt);
      chunk += `\n\n${indent}${name} {\n${indent}    display-name = ${quote(l.name)};\n${indent}    bindings = <\n${formatGrid(cells, kb)}\n${indent}    >;\n`;
      const sensors = l.sensors ? sensorText(l)?.trim() : parsed.layers[parsed.layers.length - 1]?.sensorBindings;
      if (sensors) chunk += `\n${indent}    sensor-bindings = ${sensors};\n`;
      chunk += `${indent}};`;
    }
    edits.push({ start: at, end: at, text: chunk });
  }

  // ---- コンボ ----
  if (opts.combos && !combosEqual(opts.combos, parsed.combos)) {
    const lines: string[] = ['combos {', '    compatible = "zmk,combos";'];
    const names = new Set<string>();
    opts.combos.forEach((c, i) => {
      if (c.positions.length < 2) {
        warnings.push(`コンボ「${c.name}」: キーを 2 個以上選んでください (出力しませんでした)`);
        return;
      }
      let name = /^[a-z][a-z0-9_]*$/i.test(c.name) ? c.name.toLowerCase() : `combo_${i + 1}`;
      while (names.has(name)) name += '_';
      names.add(name);
      const layerIdx = c.layers.map((id) => layerIndexById.get(id)).filter((v): v is number => v !== undefined);
      lines.push('', `    ${name} { // ${c.name.replace(/[\r\n]/g, ' ')}`);
      lines.push(`        timeout-ms = <${Math.max(1, Math.round(c.timeoutMs))}>;`);
      lines.push(`        key-positions = <${c.positions.join(' ')}>;`);
      lines.push(`        bindings = <${fmt(c.binding)}>;`);
      if (layerIdx.length) lines.push(`        layers = <${layerIdx.join(' ')}>;`);
      lines.push('    };');
    });
    lines.push('};');
    const block = lines.join('\n');
    if (parsed.combosNode) {
      const n = parsed.combosNode;
      edits.push({ start: n.start, end: n.end, text: indentBlock(block, lineIndent(text, n.start)).trimStart() });
    } else if (opts.combos.length) {
      const at = parsed.keymapNode.start;
      edits.push({ start: at, end: at, text: `${indentBlock(block, '    ').trimStart()}\n\n    ` });
    }
  } else {
    for (const c of parsed.combos) used.add(c.binding.b);
  }

  // ---- マクロ・追加ビヘイビアの定義 ----
  const macroNodes: string[] = [];
  const existing = parsed.labels;
  for (const m of macros) {
    if (existing.has(m.label)) {
      warnings.push(`マクロ ${m.label} は既に定義されているため出力しませんでした`);
      continue;
    }
    macroNodes.push(macroNodeText(m, ''));
  }
  const injected = new Set<string>();
  for (const def of registry.values()) {
    if (!def.definition || existing.has(def.label) || injected.has(def.label)) continue;
    const isExtra = extra.some((e) => e.label === def.label);
    const isOsMacro = def.label === 'os_sel' || def.label === 'os_to';
    if (used.has(def.label) || isExtra || (isOsMacro && opts.osMacros)) {
      injected.add(def.label);
      macroNodes.push(def.definition);
    }
  }
  if (macroNodes.length) {
    const body = indentBlock(macroNodes.join('\n\n'), '        ');
    if (parsed.macrosNode) {
      edits.push(appendToNode(parsed.macrosNode, body));
    } else {
      const at = parsed.keymapNode.start;
      edits.push({ start: at, end: at, text: `macros {\n${body}\n    };\n\n    ` });
    }
  }
  if (rotateNodes.length) {
    const body = indentBlock(rotateNodes.join('\n\n'), '        ');
    if (parsed.behaviorsNode) {
      edits.push(appendToNode(parsed.behaviorsNode, body));
    } else {
      const at = parsed.keymapNode.start;
      edits.push({ start: at, end: at, text: `behaviors {\n${body}\n    };\n\n    ` });
    }
  }

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let result = text;
  for (const e of edits) result = result.slice(0, e.start) + e.text + result.slice(e.end);
  return { text: result, warnings };
}

/** ノードの最後の子ノードの後ろに追加 */
function appendToNode(node: DtsNode, body: string): Edit {
  const last = node.children[node.children.length - 1];
  if (last) return { start: last.end, end: last.end, text: `\n\n${body}` };
  return { start: node.bodyEnd, end: node.bodyEnd, text: `\n${body}\n    ` };
}

export function combosEqual(a: ComboDef[], b: ComboDef[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (c, i) =>
        c.name === b[i].name &&
        c.timeoutMs === b[i].timeoutMs &&
        c.positions.join() === b[i].positions.join() &&
        c.layers.join() === b[i].layers.join() &&
        bindingsEqual(c.binding, b[i].binding),
    )
  );
}

export function macroBehavior(m: MacroDef): BehaviorDef {
  return {
    label: m.label,
    displayName: m.name,
    nameJa: m.name,
    description: 'このアプリで作成したマクロ (ファームウェアのビルドが必要)',
    params: [],
    group: 'custom',
    custom: true,
    compatible: 'zmk,behavior-macro',
  };
}

function macroNodeText(m: MacroDef, indent: string): string {
  const keys = m.keys.map((k) => `&kp ${formatKeycode(k)}`).join(' ');
  return [
    `${indent}${m.label}: ${m.label} {`,
    `${indent}    compatible = "zmk,behavior-macro";`,
    `${indent}    #binding-cells = <0>;`,
    `${indent}    display-name = ${quote(m.label)}; // ${m.name.replace(/[\r\n]/g, ' ')}`,
    `${indent}    wait-ms = <${m.waitMs}>;`,
    `${indent}    tap-ms = <${m.tapMs}>;`,
    `${indent}    bindings = <&macro_tap ${keys}>;`,
    `${indent}};`,
  ].join('\n');
}

/** パラメータ文字列 (例: "BT_SEL 2") を評価する。UI の手入力用 */
export function evaluateParamText(text: string, keymapSource: string): number[] {
  const macros = buildMacros(keymapSource);
  return splitCells(expandMacros(text, macros)).map(evalIntExpr);
}
