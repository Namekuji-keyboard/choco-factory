/**
 * 最小限の devicetree パーサー。
 *
 * 元のテキストを書き換えずに保持し、各ノード・プロパティの位置 (オフセット) を記録します。
 * エクスポート時はこの位置情報を使って必要な箇所だけを置き換えるため、
 * コメント・インクルード・マクロ・ビヘイビア定義などは元のまま保たれます。
 */

export interface DtsProp {
  name: string;
  /** '=' の後ろから ';' の手前までの生テキスト (ブール型プロパティは undefined) */
  value?: string;
  /** 文全体の範囲 [start, end) (end は ';' の直後) */
  start: number;
  end: number;
  valueStart: number;
  valueEnd: number;
}

export interface DtsNode {
  /** ノード名 (例: "default_layer", "/", "&mt") */
  name: string;
  labels: string[];
  props: DtsProp[];
  children: DtsNode[];
  /** ラベルを含む文の先頭 */
  start: number;
  /** '{' の直後 */
  bodyStart: number;
  /** 対応する '}' の位置 */
  bodyEnd: number;
  /** '};' の直後 */
  end: number;
  /** /omit-if-no-ref/ などの修飾子 */
  modifiers: string[];
}

const PREPROCESSOR = /^#\s*(include|define|undef|if|ifdef|ifndef|else|elif|endif|pragma|error|warning)\b/;

export class DtsParseError extends Error {
  constructor(
    message: string,
    public offset: number,
    text: string,
  ) {
    const line = text.slice(0, offset).split('\n').length;
    super(`${message} (${line} 行目)`);
  }
}

export function parseDts(text: string): DtsNode[] {
  const p = new Parser(text);
  return p.parseTop();
}

class Parser {
  i = 0;
  constructor(private s: string) {}

  /** 空白・コメント・プリプロセッサ行を読み飛ばす */
  skip() {
    const s = this.s;
    for (;;) {
      while (this.i < s.length && /\s/.test(s[this.i])) this.i++;
      if (s.startsWith('//', this.i)) {
        const nl = s.indexOf('\n', this.i);
        this.i = nl < 0 ? s.length : nl + 1;
        continue;
      }
      if (s.startsWith('/*', this.i)) {
        const e = s.indexOf('*/', this.i + 2);
        this.i = e < 0 ? s.length : e + 2;
        continue;
      }
      if (s[this.i] === '#' && this.atLineStart() && PREPROCESSOR.test(s.slice(this.i, this.i + 20))) {
        // 行継続 (\) を考慮して行末まで
        let j = this.i;
        for (;;) {
          const nl = s.indexOf('\n', j);
          if (nl < 0) {
            j = s.length;
            break;
          }
          if (s[nl - 1] === '\\' || (s[nl - 1] === '\r' && s[nl - 2] === '\\')) {
            j = nl + 1;
            continue;
          }
          j = nl + 1;
          break;
        }
        this.i = j;
        continue;
      }
      break;
    }
  }

  atLineStart(): boolean {
    let j = this.i - 1;
    while (j >= 0 && (this.s[j] === ' ' || this.s[j] === '\t')) j--;
    return j < 0 || this.s[j] === '\n';
  }

  parseTop(): DtsNode[] {
    const nodes: DtsNode[] = [];
    for (;;) {
      this.skip();
      if (this.i >= this.s.length) break;
      const item = this.parseStatement();
      if (item && 'children' in item) nodes.push(item);
    }
    return nodes;
  }

  /** ノードまたはプロパティを1つ読む */
  parseStatement(): DtsNode | DtsProp | null {
    const s = this.s;
    this.skip();
    const start = this.i;
    const modifiers: string[] = [];
    // /dts-v1/; /omit-if-no-ref/ /delete-node/ など
    while (s[this.i] === '/' && /^\/[a-z-]+\//.test(s.slice(this.i, this.i + 30))) {
      const m = /^\/[a-z-]+\//.exec(s.slice(this.i, this.i + 30))!;
      modifiers.push(m[0]);
      this.i += m[0].length;
      this.skip();
      if (s[this.i] === ';') {
        this.i++;
        return null;
      }
    }
    // 先頭部分 (ラベル + 名前) を '{' '=' ';' まで読む
    let head = '';
    while (this.i < s.length) {
      this.skip();
      const c = s[this.i];
      if (c === '{' || c === '=' || c === ';') break;
      if (c === '}') throw new DtsParseError('予期しない "}"', this.i, s);
      head += c;
      this.i++;
      // トークンの区切りとして空白を残す
      if (/\s/.test(s[this.i] ?? '')) head += ' ';
    }
    head = head.trim();
    const c = s[this.i];
    if (c === '{') {
      this.i++;
      const bodyStart = this.i;
      const parts = head.split(/\s+/).filter(Boolean);
      const labels: string[] = [];
      let name = '';
      for (const part of parts) {
        if (part.endsWith(':')) labels.push(part.slice(0, -1));
        else name = part;
      }
      const node: DtsNode = { name, labels, props: [], children: [], start, bodyStart, bodyEnd: 0, end: 0, modifiers };
      for (;;) {
        this.skip();
        if (this.i >= s.length) throw new DtsParseError(`ノード "${name}" が閉じていません`, start, s);
        if (s[this.i] === '}') {
          node.bodyEnd = this.i;
          this.i++;
          this.skip();
          if (s[this.i] === ';') this.i++;
          node.end = this.i;
          return node;
        }
        const item = this.parseStatement();
        if (!item) continue;
        if ('children' in item) node.children.push(item);
        else node.props.push(item);
      }
    }
    if (c === '=') {
      this.i++;
      const valueStart = this.i;
      this.readValue();
      const valueEnd = this.i;
      this.i++; // ';'
      return { name: head, value: s.slice(valueStart, valueEnd), start, end: this.i, valueStart, valueEnd };
    }
    if (c === ';') {
      this.i++;
      return { name: head, start, end: this.i, valueStart: this.i - 1, valueEnd: this.i - 1 };
    }
    throw new DtsParseError('構文を解析できません', start, s);
  }

  /** ';' の手前まで値を読む (文字列・括弧・コメントを考慮) */
  readValue() {
    const s = this.s;
    let angle = 0;
    let paren = 0;
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === '"') {
        this.i++;
        while (this.i < s.length && s[this.i] !== '"') {
          if (s[this.i] === '\\') this.i++;
          this.i++;
        }
        this.i++;
        continue;
      }
      if (s.startsWith('//', this.i) || s.startsWith('/*', this.i)) {
        this.skip();
        continue;
      }
      if (c === '<') angle++;
      else if (c === '>' && paren === 0 && angle > 0 && s[this.i - 1] !== '>' && s[this.i + 1] !== '>') angle--;
      else if (c === '(') paren++;
      else if (c === ')') paren--;
      else if (c === ';' && angle === 0 && paren === 0) return;
      this.i++;
    }
    throw new DtsParseError('プロパティが ";" で終わっていません', this.i, s);
  }
}

/** コメントを取り除く (値の解析用) */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

export function findProp(node: DtsNode, name: string): DtsProp | undefined {
  return node.props.find((p) => p.name === name);
}

/** 文字列プロパティの値 ("..." の中身) */
export function stringProp(node: DtsNode, name: string): string | undefined {
  const p = findProp(node, name);
  if (!p?.value) return undefined;
  const m = /"((?:[^"\\]|\\.)*)"/.exec(p.value);
  return m ? m[1].replace(/\\(.)/g, '$1') : undefined;
}

export function walk(nodes: DtsNode[], fn: (n: DtsNode, parent?: DtsNode) => void, parent?: DtsNode) {
  for (const n of nodes) {
    fn(n, parent);
    walk(n.children, fn, n);
  }
}

/**
 * `<...>` で囲まれたセル列をトークンに分割する。括弧内の空白は分割しない。
 * 例: "<&kp LC(LS(C)) &mt PSCRN LWIN>" → ["&kp", "LC(LS(C))", "&mt", "PSCRN", "LWIN"]
 */
export function tokenizeCells(value: string): string[] {
  const t = stripComments(value);
  const tokens: string[] = [];
  let cur = '';
  let depth = 0;
  for (const c of t) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth === 0 && (/\s/.test(c) || c === '<' || c === '>' || c === ',')) {
      if (cur) tokens.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/** トークン列を "&behavior param..." ごとにまとめる */
export function groupBindings(tokens: string[]): { behavior: string; params: string[] }[] {
  const out: { behavior: string; params: string[] }[] = [];
  for (const tok of tokens) {
    if (tok.startsWith('&')) out.push({ behavior: tok.slice(1), params: [] });
    else if (out.length) out[out.length - 1].params.push(tok);
    else throw new Error(`ビヘイビア (&...) の前に値があります: ${tok}`);
  }
  return out;
}
