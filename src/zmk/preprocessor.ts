/**
 * ZMK キーマップ (devicetree + C プリプロセッサ) のパラメータを評価するための最小限のプリプロセッサ。
 *
 * - オブジェクト形式 / 関数形式マクロの展開
 * - 展開後のトークン列を「セル」(devicetree の 32bit 値) に分割
 * - 各セルを整数式として安全に評価 (eval は使わない)
 */

export interface MacroDef {
  params?: string[]; // 関数形式マクロの仮引数
  body: string;
}

export type MacroTable = Map<string, MacroDef>;

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;

/** `#define NAME body` / `#define NAME(a, b) body` を読み込む */
export function parseDefines(text: string, into: MacroTable = new Map()): MacroTable {
  const joined = text.replace(/\\\r?\n/g, ' ');
  for (const rawLine of joined.split(/\r?\n/)) {
    const line = stripLineComment(rawLine);
    const m = /^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)(\(([^)]*)\))?\s*(.*)$/.exec(line);
    if (m) {
      const name = m[1];
      const params = m[2] !== undefined ? m[3].split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      into.set(name, { params, body: m[4].trim() });
      continue;
    }
    const u = /^\s*#\s*undef\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (u) into.delete(u[1]);
  }
  return into;
}

function stripLineComment(line: string): string {
  const i = line.indexOf('//');
  let s = i >= 0 ? line.slice(0, i) : line;
  s = s.replace(/\/\*.*?\*\//g, ' ');
  return s;
}

/** テキスト中のマクロを再帰的に展開する */
export function expandMacros(text: string, macros: MacroTable, depth = 0, hide: Set<string> = new Set()): string {
  if (depth > 40) throw new Error(`マクロの展開が深すぎます: ${text}`);
  let out = '';
  let i = 0;
  while (i < text.length) {
    IDENT.lastIndex = i;
    const m = IDENT.exec(text);
    const prev = i > 0 ? text[i - 1] : '';
    if (m && !/[A-Za-z0-9_]/.test(prev)) {
      const name = m[0];
      const def = macros.get(name);
      let next = i + name.length;
      if (def && !hide.has(name)) {
        if (def.params) {
          // 関数形式: 直後の "(...)" を読む
          let j = next;
          while (j < text.length && /\s/.test(text[j])) j++;
          if (text[j] === '(') {
            const { args, end } = readArgs(text, j);
            let body = def.body;
            // ## (トークン連結) は ZMK では RGB_COLOR_HSB のみで使われ、実質的に空白と同義
            body = body.replace(/\s*##\s*/g, ' ');
            const expandedArgs = args.map((a) => expandMacros(a, macros, depth + 1, hide));
            body = body.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (id) => {
              const k = def.params!.indexOf(id);
              return k >= 0 ? `(${expandedArgs[k]})` : id;
            });
            const h = new Set(hide);
            h.add(name);
            out += expandMacros(body, macros, depth + 1, h);
            i = end;
            continue;
          }
          out += name;
          i = next;
          continue;
        }
        const h = new Set(hide);
        h.add(name);
        out += expandMacros(def.body, macros, depth + 1, h);
        i = next;
        continue;
      }
      out += name;
      i = next;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

function readArgs(text: string, open: number): { args: string[]; end: number } {
  let depth = 0;
  const args: string[] = [];
  let cur = '';
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '(') {
      depth++;
      if (depth === 1) continue;
    } else if (c === ')') {
      depth--;
      if (depth === 0) {
        args.push(cur.trim());
        return { args: args.filter((a, idx) => a !== '' || idx > 0 || args.length > 1), end: i + 1 };
      }
    } else if (c === ',' && depth === 1) {
      args.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  throw new Error(`括弧が閉じていません: ${text}`);
}

/**
 * 空白区切りのトップレベル式に分割する (括弧内の空白は分割しない)。
 * devicetree の `< >` 内では演算を含む式は必ず括弧で囲む規則なので、トップレベルの空白はセル区切り。
 */
export function splitCells(text: string): string[] {
  const cells: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of text.trim()) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (/\s/.test(c) && depth === 0) {
      if (cur) cells.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur) cells.push(cur);
  return cells;
}

/** 整数式を評価する (C の 32bit 符号なし整数として返す) */
export function evalIntExpr(expr: string): number {
  const p = new ExprParser(expr);
  const v = p.parseExpr();
  p.expectEnd();
  return v >>> 0;
}

class ExprParser {
  private toks: string[];
  private pos = 0;
  constructor(src: string) {
    this.toks = src.match(/0[xX][0-9a-fA-F]+|\d+[uUlL]*|<<|>>|[A-Za-z_]\w*|[()+\-*/%|&^~!]/g) ?? [];
    const joined = this.toks.join('');
    if (joined.length !== src.replace(/\s+/g, '').length) {
      throw new Error(`評価できない式です: ${src}`);
    }
  }
  private peek() {
    return this.toks[this.pos];
  }
  private next() {
    return this.toks[this.pos++];
  }
  expectEnd() {
    if (this.pos !== this.toks.length) throw new Error(`式の末尾が不正です: ${this.toks.join(' ')}`);
  }
  parseExpr(): number {
    return this.parseOr();
  }
  private parseOr(): number {
    let v = this.parseXor();
    while (this.peek() === '|') {
      this.next();
      v = (v | this.parseXor()) >>> 0;
    }
    return v;
  }
  private parseXor(): number {
    let v = this.parseAnd();
    while (this.peek() === '^') {
      this.next();
      v = (v ^ this.parseAnd()) >>> 0;
    }
    return v;
  }
  private parseAnd(): number {
    let v = this.parseShift();
    while (this.peek() === '&') {
      this.next();
      v = (v & this.parseShift()) >>> 0;
    }
    return v;
  }
  private parseShift(): number {
    let v = this.parseAdd();
    while (this.peek() === '<<' || this.peek() === '>>') {
      const op = this.next();
      const r = this.parseAdd();
      v = op === '<<' ? (v << r) >>> 0 : v >>> r;
    }
    return v;
  }
  private parseAdd(): number {
    let v = this.parseMul();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.next();
      const r = this.parseMul();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  private parseMul(): number {
    let v = this.parseUnary();
    while (this.peek() === '*' || this.peek() === '/' || this.peek() === '%') {
      const op = this.next();
      const r = this.parseUnary();
      v = op === '*' ? v * r : op === '/' ? Math.trunc(v / r) : v % r;
    }
    return v;
  }
  private parseUnary(): number {
    const t = this.peek();
    if (t === '-') {
      this.next();
      return -this.parseUnary();
    }
    if (t === '+') {
      this.next();
      return this.parseUnary();
    }
    if (t === '~') {
      this.next();
      return ~this.parseUnary() >>> 0;
    }
    if (t === '!') {
      this.next();
      return this.parseUnary() ? 0 : 1;
    }
    return this.parsePrimary();
  }
  private parsePrimary(): number {
    const t = this.next();
    if (t === undefined) throw new Error('式が途中で終わっています');
    if (t === '(') {
      const v = this.parseExpr();
      if (this.next() !== ')') throw new Error('括弧が閉じていません');
      return v;
    }
    if (/^0[xX]/.test(t)) return parseInt(t, 16);
    if (/^\d/.test(t)) return parseInt(t, 10);
    if (t === 'BIT' && this.peek() === '(') {
      this.next();
      const v = this.parseExpr();
      if (this.next() !== ')') throw new Error('括弧が閉じていません');
      return (1 << v) >>> 0;
    }
    throw new Error(`未定義の名前です: ${t}`);
  }
}

/**
 * パラメータのトークン列 (例: ["BT_SEL", "4"], ["LC(LS(C))"]) をマクロ展開し、数値セル列に変換する。
 * 評価できないトークンがあれば例外を投げる。
 */
export function evaluateParams(tokens: string[], macros: MacroTable): number[] {
  if (tokens.length === 0) return [];
  const expanded = expandMacros(tokens.join(' '), macros);
  return splitCells(expanded).map(evalIntExpr);
}
