export type Variables = Record<string, number>;
export type Expression = (variables: Variables) => number;

const functions: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  log: Math.log10,
  ln: Math.log,
  floor: Math.floor,
  ceil: Math.ceil,
};
const variables = new Set(["x", "t", "bass", "mid", "treble", "beat", "rms"]);

/** A bounded mathematical grammar; user input is never executed as JavaScript. */
export function compileExpression(source: string): Expression {
  if (source.length > 256) throw new Error("Use at most 256 characters.");
  const tokens =
    source
      .toLowerCase()
      .match(/(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[^\s]/g) ?? [];
  if (!tokens.length) throw new Error("Enter an expression in x.");
  if (tokens.length > 128) throw new Error("Expression is too complex.");
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  function atom(): Expression {
    const token = take();
    if (token === "(") {
      const result = sum();
      if (take() !== ")") throw new Error("Missing closing parenthesis.");
      return result;
    }
    if (token && /^(?:\d|\.)/.test(token)) {
      const value = Number(token);
      if (!Number.isFinite(value)) throw new Error("Invalid number.");
      return () => value;
    }
    if (token === "pi") return () => Math.PI;
    if (token === "e") return () => Math.E;
    if (variables.has(token)) return (v) => v[token] ?? 0;
    if (Object.hasOwn(functions, token)) {
      if (take() !== "(") throw new Error(`Use ${token}(…).`);
      const argument = sum();
      if (take() !== ")") throw new Error("Missing closing parenthesis.");
      return (v) => functions[token](argument(v));
    }
    throw new Error(`Unexpected ${token ?? "end of expression"}.`);
  }
  function power(): Expression {
    const left = atom();
    if (peek() === "^") {
      take();
      const right = unary();
      return (v) => left(v) ** right(v);
    }
    return left;
  }
  function unary(): Expression {
    if (peek() === "+") {
      take();
      return unary();
    }
    if (peek() === "-") {
      take();
      const value = unary();
      return (v) => -value(v);
    }
    return power();
  }
  function product(): Expression {
    let left = unary();
    while (
      peek() === "*" ||
      peek() === "/" ||
      (peek() && /^(?:[a-z(]|\d|\.)/.test(peek()))
    ) {
      const op = peek() === "*" || peek() === "/" ? take() : "*";
      const a = left,
        b = unary();
      left = op === "/" ? (v) => a(v) / b(v) : (v) => a(v) * b(v);
    }
    return left;
  }
  function sum(): Expression {
    let left = product();
    while (peek() === "+" || peek() === "-") {
      const op = take(),
        a = left,
        b = product();
      left = op === "+" ? (v) => a(v) + b(v) : (v) => a(v) - b(v);
    }
    return left;
  }
  const result = sum();
  if (index !== tokens.length) throw new Error(`Unexpected ${peek()}.`);
  return result;
}
