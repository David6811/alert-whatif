import { describe, expect, it } from 'vitest';
import { pipe } from './pipe';

const inc = (n: number) => n + 1;
const double = (n: number) => n * 2;
const toStr = (n: number) => `${n}`;
const exclaim = (s: string) => `${s}!`;

describe('pipe', () => {
  it('returns input unchanged through a single fn', () => {
    expect(pipe(1, inc)).toBe(2);
  });

  it('threads through two fns left-to-right (not right-to-left)', () => {
    expect(pipe(3, inc, double)).toBe(8);
  });

  it('changes types between stages', () => {
    const result: string = pipe(3, inc, double, toStr, exclaim);
    expect(result).toBe('8!');
  });

  it('chains up to six stages', () => {
    const result: number = pipe(0, inc, inc, inc, double, double, inc);
    expect(result).toBe(13);
  });

  it('preserves readonly array input by reference when no stage mutates', () => {
    const xs: ReadonlyArray<number> = [1, 2, 3];
    const out = pipe(xs, (a) => a);
    expect(out).toBe(xs);
  });
});
