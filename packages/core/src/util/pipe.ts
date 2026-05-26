// Tiny typed function-composition helper: `pipe(x, f, g, h)` ≡ `h(g(f(x)))`.
//
// Hand-rolled overloads up to six stages because that's what the evaluator needs;
// extend the table when a longer chain shows up. No runtime dependency — at the cost
// of a fixed maximum arity, we get clean type inference at every position without
// pulling in fp-ts.
//
// Why overloads instead of a single variadic signature? Generic spread types
// (`<F extends ((x: any) => any)[]>(...fns: F)`) would let TypeScript infer the chain
// shape automatically, but the inferred types come out as nested conditional
// computations that surface as opaque blobs in editor tooltips and stack traces.
// Explicit overloads keep each step's input/output type readable.

export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
): D;
export function pipe<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E;
export function pipe<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
): F;
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
): G;
export function pipe(
  input: unknown,
  ...fns: ReadonlyArray<(x: unknown) => unknown>
): unknown {
  return fns.reduce((acc, fn) => fn(acc), input);
}
