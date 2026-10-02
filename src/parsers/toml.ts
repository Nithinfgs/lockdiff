/**
 * A small TOML reader covering what lockfiles use: tables, arrays of tables,
 * strings, numbers, booleans, arrays and inline tables. It is not a general
 * TOML implementation (no datetime semantics, no multiline-string edge cases
 * beyond the basics).
 */
import { UserError } from "../model.js";

export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;
export interface TomlTable {
  [key: string]: TomlValue;
}

class Scanner {
  pos = 0;
  constructor(readonly src: string) {}

  eof(): boolean {
    return this.pos >= this.src.length;
  }
  peek(): string {
    return this.src.charAt(this.pos);
  }
  fail(msg: string): never {
    const line = this.src.slice(0, this.pos).split("\n").length;
    throw new UserError(`TOML parse error on line ${line}: ${msg}`);
  }
  /** Skip spaces and tabs only. */
  skipInline(): void {
    while (this.peek() === " " || this.peek() === "\t") this.pos++;
  }
  /** Skip whitespace, newlines and comments. */
  skipAll(): void {
    for (;;) {
      const c = this.peek();
      if (c === " " || c === "\t" || c === "\n" || c === "\r") this.pos++;
      else if (c === "#") while (!this.eof() && this.peek() !== "\n") this.pos++;
      else return;
    }
  }
}

const BARE = /[A-Za-z0-9_-]/;

function parseKeyPart(s: Scanner): string {
  s.skipInline();
  const c = s.peek();
  if (c === '"') return parseBasicString(s);
  if (c === "'") return parseLiteralString(s);
  const start = s.pos;
  while (BARE.test(s.peek())) s.pos++;
  if (s.pos === start) s.fail(`unexpected character "${c}" in key`);
  return s.src.slice(start, s.pos);
}

function parseKey(s: Scanner): string[] {
  const parts = [parseKeyPart(s)];
  s.skipInline();
  while (s.peek() === ".") {
    s.pos++;
    parts.push(parseKeyPart(s));
    s.skipInline();
  }
  return parts;
}

const ESCAPES: Record<string, string> = {
  b: "\b",
  t: "\t",
  n: "\n",
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\",
};

function parseBasicString(s: Scanner): string {
  if (s.src.startsWith('"""', s.pos)) return parseMultiline(s, '"""', true);
  s.pos++;
  let out = "";
  for (;;) {
    if (s.eof() || s.peek() === "\n") s.fail("unterminated string");
    const c = s.peek();
    s.pos++;
    if (c === '"') return out;
    if (c === "\\") out += readEscape(s);
    else out += c;
  }
}

function readEscape(s: Scanner): string {
  const e = s.peek();
  s.pos++;
  if (e in ESCAPES) return ESCAPES[e] as string;
  if (e === "u" || e === "U") {
    const len = e === "u" ? 4 : 8;
    const hex = s.src.slice(s.pos, s.pos + len);
    s.pos += len;
    return String.fromCodePoint(Number.parseInt(hex, 16));
  }
  return s.fail(`invalid escape \\${e}`);
}

function parseLiteralString(s: Scanner): string {
  if (s.src.startsWith("'''", s.pos)) return parseMultiline(s, "'''", false);
  const end = s.src.indexOf("'", s.pos + 1);
  const nl = s.src.indexOf("\n", s.pos);
  if (end === -1 || (nl !== -1 && nl < end)) s.fail("unterminated string");
  const out = s.src.slice(s.pos + 1, end);
  s.pos = end + 1;
  return out;
}

function parseMultiline(s: Scanner, delim: string, escapes: boolean): string {
  s.pos += 3;
  if (s.peek() === "\r") s.pos++;
  if (s.peek() === "\n") s.pos++;
  let out = "";
  for (;;) {
    if (s.eof()) s.fail("unterminated multiline string");
    if (s.src.startsWith(delim, s.pos)) {
      // up to two further quotes belong to the content
      const q = delim.charAt(0);
      let extra = 0;
      while (extra < 2 && s.src.charAt(s.pos + 3 + extra) === q) extra++;
      s.pos += 3 + extra;
      return out + q.repeat(extra);
    }
    const c = s.peek();
    s.pos++;
    if (escapes && c === "\\") {
      if (s.peek() === "\n" || s.peek() === "\r") {
        while (/\s/.test(s.peek())) s.pos++;
      } else out += readEscape(s);
    } else out += c;
  }
}

function parseArray(s: Scanner): TomlValue[] {
  s.pos++;
  const out: TomlValue[] = [];
  for (;;) {
    s.skipAll();
    if (s.peek() === "]") {
      s.pos++;
      return out;
    }
    out.push(parseValue(s));
    s.skipAll();
    if (s.peek() === ",") s.pos++;
    else if (s.peek() !== "]") s.fail("expected , or ] in array");
  }
}

function parseInlineTable(s: Scanner): TomlTable {
  s.pos++;
  const out: TomlTable = {};
  for (;;) {
    s.skipAll();
    if (s.peek() === "}") {
      s.pos++;
      return out;
    }
    const key = parseKey(s);
    s.skipInline();
    if (s.peek() !== "=") s.fail("expected = in inline table");
    s.pos++;
    setPath(out, key, parseValue(s));
    s.skipAll();
    if (s.peek() === ",") s.pos++;
    else if (s.peek() !== "}") s.fail("expected , or } in inline table");
  }
}

function parseValue(s: Scanner): TomlValue {
  s.skipInline();
  const c = s.peek();
  if (c === '"') return parseBasicString(s);
  if (c === "'") return parseLiteralString(s);
  if (c === "[") return parseArray(s);
  if (c === "{") return parseInlineTable(s);
  const start = s.pos;
  while (!s.eof() && !/[\s,\]}#]/.test(s.peek())) s.pos++;
  const raw = s.src.slice(start, s.pos);
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^[+-]?(\d[\d_]*)$/.test(raw)) return Number.parseInt(raw.replaceAll("_", ""), 10);
  if (/^[+-]?(\d[\d_]*)?\.?\d[\d_]*([eE][+-]?\d+)?$/.test(raw)) {
    return Number.parseFloat(raw.replaceAll("_", ""));
  }
  if (raw === "") s.fail("missing value");
  return raw; // datetimes, inf, nan: keep raw text
}

function setPath(root: TomlTable, path: string[], value: TomlValue): void {
  let cur = root;
  for (const part of path.slice(0, -1)) cur = descend(cur, part);
  cur[path[path.length - 1] as string] = value;
}

/** Step into (creating if needed) a sub-table; for arrays of tables use the last element. */
function descend(cur: TomlTable, part: string): TomlTable {
  const next = cur[part];
  if (next === undefined) {
    const created: TomlTable = {};
    cur[part] = created;
    return created;
  }
  if (Array.isArray(next)) {
    const last = next[next.length - 1];
    if (last && typeof last === "object" && !Array.isArray(last)) return last;
    throw new UserError(`TOML key "${part}" is not a table`);
  }
  if (typeof next === "object") return next;
  throw new UserError(`TOML key "${part}" is not a table`);
}

export function parseToml(text: string): TomlTable {
  const s = new Scanner(text.replace(/^﻿/, ""));
  const root: TomlTable = {};
  let current = root;
  for (;;) {
    s.skipAll();
    if (s.eof()) return root;
    if (s.peek() === "[") {
      const isArray = s.src.startsWith("[[", s.pos);
      s.pos += isArray ? 2 : 1;
      const path = parseKey(s);
      s.skipInline();
      const close = isArray ? "]]" : "]";
      if (!s.src.startsWith(close, s.pos)) s.fail(`expected ${close}`);
      s.pos += close.length;
      let parent = root;
      for (const part of path.slice(0, -1)) parent = descend(parent, part);
      const leaf = path[path.length - 1] as string;
      if (isArray) {
        const existing = parent[leaf];
        const arr = Array.isArray(existing) ? existing : [];
        const table: TomlTable = {};
        arr.push(table);
        parent[leaf] = arr;
        current = table;
      } else {
        current = descend(parent, leaf);
      }
      continue;
    }
    const key = parseKey(s);
    s.skipInline();
    if (s.peek() !== "=") s.fail(`expected = after key "${key.join(".")}"`);
    s.pos++;
    setPath(current, key, parseValue(s));
  }
}

export function asTable(v: TomlValue | undefined): TomlTable | undefined {
  return v !== undefined && typeof v === "object" && !Array.isArray(v) ? v : undefined;
}
export function asArray(v: TomlValue | undefined): TomlValue[] {
  return Array.isArray(v) ? v : [];
}
export function asString(v: TomlValue | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
