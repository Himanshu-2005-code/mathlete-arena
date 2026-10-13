/**
 * A small, safe arithmetic expression engine for the number puzzles (Hectoc,
 * Make 24). It parses + − × ÷ ^ and brackets, works in exact fractions so
 * 8 ÷ 3 × 3 is exactly 8, and reports which numbers were typed.
 * Nothing is ever passed to eval.
 */

export interface Frac {
  n: number;
  d: number;
}

const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

export function frac(n: number, d = 1): Frac {
  if (d === 0) throw new Error("division by zero");
  const s = d < 0 ? -1 : 1;
  const g = gcd(n, d);
  return { n: (s * n) / g, d: (s * d) / g };
}

const LIMIT = 1e12;
const checked = (f: Frac): Frac => {
  if (!Number.isSafeInteger(f.n) || !Number.isSafeInteger(f.d) || Math.abs(f.n) > LIMIT || f.d > LIMIT) {
    throw new Error("number too large");
  }
  return f;
};

export const add = (a: Frac, b: Frac) => checked(frac(a.n * b.d + b.n * a.d, a.d * b.d));
export const sub = (a: Frac, b: Frac) => checked(frac(a.n * b.d - b.n * a.d, a.d * b.d));
export const mul = (a: Frac, b: Frac) => checked(frac(a.n * b.n, a.d * b.d));
export const div = (a: Frac, b: Frac) => {
  if (b.n === 0) throw new Error("division by zero");
  return checked(frac(a.n * b.d, a.d * b.n));
};
/** Whole-number powers only, kept small. */
export function pow(a: Frac, b: Frac): Frac {
  if (b.d !== 1 || Math.abs(b.n) > 12) throw new Error("exponent must be a whole number up to 12");
  if (a.n === 0 && b.n < 0) throw new Error("division by zero");
  const e = Math.abs(b.n);
  const r = checked(frac(a.n ** e, a.d ** e));
  return b.n < 0 ? frac(r.d, r.n) : r;
}

export const fracEq = (a: Frac, n: number) => a.d === 1 && a.n === n;
export const showFrac = (f: Frac) => (f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);

type Token = { t: "num"; v: number; text: string } | { t: "op"; v: string } | { t: "(" } | { t: ")" };

const OP_ALIASES: Record<string, string> = { "*": "×", x: "×", X: "×", "/": "÷", ":": "÷", "−": "-", "–": "-" };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/\d/.test(ch)) {
      let j = i;
      while (j < src.length && /\d/.test(src[j])) j++;
      const text = src.slice(i, j);
      if (text.length > 9) throw new Error("number too long");
      out.push({ t: "num", v: Number(text), text });
      i = j;
    } else if ("+-×÷^".includes(ch) || OP_ALIASES[ch]) {
      out.push({ t: "op", v: OP_ALIASES[ch] ?? ch });
      i++;
    } else if (ch === "(" || ch === "[") {
      out.push({ t: "(" });
      i++;
    } else if (ch === ")" || ch === "]") {
      out.push({ t: ")" });
      i++;
    } else {
      throw new Error(`"${ch}" isn't allowed`);
    }
  }
  return out;
}

export interface Parsed {
  value: Frac;
  /** The numbers typed, in order, exactly as written ("12" stays "12"). */
  numbers: string[];
}

/**
 * Parse and evaluate. Precedence: ^ (right to left), then unary minus, then
 * × ÷, then + −. Throws with a readable message on anything malformed.
 */
export function evaluateExpression(src: string, opts: { allowPower?: boolean; allowUnaryMinus?: boolean } = {}): Parsed {
  const { allowPower = true, allowUnaryMinus = true } = opts;
  const tokens = tokenize(src);
  if (tokens.length === 0) throw new Error("Type an expression");
  if (tokens.length > 80) throw new Error("expression too long");
  let pos = 0;
  const numbers: string[] = [];
  const peek = () => tokens[pos];
  const isOp = (v: string) => {
    const t = peek();
    return t?.t === "op" && t.v === v;
  };

  const primary = (): Frac => {
    const t = tokens[pos++];
    if (!t) throw new Error("expression ends too soon");
    if (t.t === "num") {
      numbers.push(t.text);
      return frac(t.v);
    }
    if (t.t === "(") {
      const v = sum();
      if (tokens[pos++]?.t !== ")") throw new Error("missing )");
      return v;
    }
    throw new Error("expected a number");
  };
  const power = (): Frac => {
    const base = primary();
    if (isOp("^")) {
      if (!allowPower) throw new Error("^ isn't allowed here");
      pos++;
      return pow(base, unary());
    }
    return base;
  };
  const unary = (): Frac => {
    if (isOp("-")) {
      if (!allowUnaryMinus) throw new Error("a minus sign needs a number before it");
      pos++;
      const v = unary();
      return frac(-v.n, v.d);
    }
    return power();
  };
  const product = (): Frac => {
    let v = unary();
    while (isOp("×") || isOp("÷")) {
      const op = (tokens[pos++] as { v: string }).v;
      const r = unary();
      v = op === "×" ? mul(v, r) : div(v, r);
    }
    return v;
  };
  const sum = (): Frac => {
    let v = product();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[pos++] as { v: string }).v;
      const r = product();
      v = op === "+" ? add(v, r) : sub(v, r);
    }
    return v;
  };

  const value = sum();
  if (pos !== tokens.length) throw new Error(tokens[pos].t === ")" ? "extra )" : "unexpected symbol");
  return { value, numbers };
}

/** Evaluate, returning null instead of throwing. */
export function tryEvaluate(src: string, opts?: Parameters<typeof evaluateExpression>[1]) {
  try {
    return { ok: true as const, ...evaluateExpression(src, opts) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
