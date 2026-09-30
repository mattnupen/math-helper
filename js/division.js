// The long-division procedure model. Pure functions, no DOM.
//
// A problem is worked as a series of rounds. Every round has the same four
// steps (Divide, Multiply, Subtract, Bring down). On the last round the
// Bring down step is where the student finds there is nothing left.

export const STEP_KEYS = ['divide', 'multiply', 'subtract', 'bringDown'];

export const MAX_DIVIDEND_DIGITS = 6;
export const MAX_DIVISOR_DIGITS = 2;

// Returns a message a student can act on, or null when the problem is usable.
export function problemError(dividendText, divisorText) {
  const a = String(dividendText ?? '').trim();
  const b = String(divisorText ?? '').trim();
  if (!a || !b) return 'Type both numbers.';
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return 'Use digits only.';
  if (a.length > MAX_DIVIDEND_DIGITS) return `The number to divide can have up to ${MAX_DIVIDEND_DIGITS} digits.`;
  if (b.length > MAX_DIVISOR_DIGITS) return `The number to divide by can have up to ${MAX_DIVISOR_DIGITS} digits.`;
  const dividend = Number(a);
  const divisor = Number(b);
  if (divisor < 2) return 'Divide by 2 or more.';
  if (dividend < divisor) return 'The first number needs to be bigger than the number you divide by.';
  return null;
}

// Accepts "943/3", "943 ÷ 3" or "943 / 3". Returns { dividend, divisor } or null.
export function parseProblem(text) {
  const m = String(text ?? '').trim().match(/^(\d+)\s*[/÷]\s*(\d+)$/);
  if (!m || problemError(m[1], m[2])) return null;
  return { dividend: Number(m[1]), divisor: Number(m[2]) };
}

export function problemKey({ dividend, divisor }) {
  return `${dividend}/${divisor}`;
}

export function planDivision(dividend, divisor) {
  const digits = String(dividend).split('').map(Number);

  // Use as many leading digits as it takes for the divisor to fit.
  let prefixLen = 1;
  let number = digits[0];
  while (number < divisor) {
    number = number * 10 + digits[prefixLen];
    prefixLen += 1;
  }

  const rounds = [];
  let nextIndex = prefixLen;
  for (;;) {
    const q = Math.floor(number / divisor);
    const product = q * divisor;
    const diff = number - product;
    const hasNext = nextIndex < digits.length;
    rounds.push({
      number,
      q,
      product,
      diff,
      // The dividend digit the quotient digit is written above.
      endIndex: nextIndex - 1,
      bringIndex: hasNext ? nextIndex : null,
      bringDigit: hasNext ? digits[nextIndex] : null,
      next: hasNext ? diff * 10 + digits[nextIndex] : null,
    });
    if (!hasNext) break;
    number = diff * 10 + digits[nextIndex];
    nextIndex += 1;
  }

  return {
    dividend,
    divisor,
    digits,
    prefixLen,
    rounds,
    quotient: Math.floor(dividend / divisor),
    remainder: dividend % divisor,
  };
}

// Positions: { kind: 'intro' } | { kind: 'step', round, step } | { kind: 'done' }

export function nextPos(plan, pos) {
  const lastRound = plan.rounds.length - 1;
  if (pos.kind === 'intro') return { kind: 'step', round: 0, step: 0 };
  if (pos.kind === 'done') return null;
  if (pos.step < STEP_KEYS.length - 1) return { kind: 'step', round: pos.round, step: pos.step + 1 };
  if (pos.round < lastRound) return { kind: 'step', round: pos.round + 1, step: 0 };
  return { kind: 'done' };
}

export function prevPos(plan, pos) {
  const lastRound = plan.rounds.length - 1;
  if (pos.kind === 'intro') return null;
  if (pos.kind === 'done') return { kind: 'step', round: lastRound, step: STEP_KEYS.length - 1 };
  if (pos.step > 0) return { kind: 'step', round: pos.round, step: pos.step - 1 };
  if (pos.round > 0) return { kind: 'step', round: pos.round - 1, step: STEP_KEYS.length - 1 };
  return { kind: 'intro' };
}

// The number a student should have written at the end of a step, for the
// optional "check my number" box. null when there is nothing to check.
export function expectedValue(plan, pos) {
  if (pos.kind !== 'step') return null;
  const r = plan.rounds[pos.round];
  switch (STEP_KEYS[pos.step]) {
    case 'divide': return r.q;
    case 'multiply': return r.product;
    case 'subtract': return r.diff;
    case 'bringDown': return r.next;
  }
  return null;
}

// Position encoding for the URL: "2.3" = round 2, step 3 (both 1-based).
export function encodePos(pos) {
  if (pos.kind === 'intro') return null;
  if (pos.kind === 'done') return 'done';
  return `${pos.round + 1}.${pos.step + 1}`;
}

export function decodePos(plan, text) {
  if (!text) return { kind: 'intro' };
  if (text === 'done') return { kind: 'done' };
  const m = String(text).match(/^(\d+)\.(\d+)$/);
  if (!m) return { kind: 'intro' };
  const round = Number(m[1]) - 1;
  const step = Number(m[2]) - 1;
  if (round < 0 || round >= plan.rounds.length || step < 0 || step >= STEP_KEYS.length) return { kind: 'intro' };
  return { kind: 'step', round, step };
}

// "Where am I?" — find the student's place from what is on their paper.
//   topCount: how many digits are written above the division bar
//   lastMark: the last thing they wrote —
//     'top'         a new digit on top
//     'under'       a number under their number, no line yet
//     'line'        a line with a number under it
//     'broughtDown' a digit brought down next to that number
// Returns the step to do next, or null when the answers don't fit this problem.
export function locate(plan, topCount, lastMark) {
  const rounds = plan.rounds.length;
  if (!Number.isInteger(topCount) || topCount < 0 || topCount > rounds) return null;
  if (topCount === 0) return { kind: 'step', round: 0, step: 0 };
  const round = topCount - 1;
  switch (lastMark) {
    case 'top': return { kind: 'step', round, step: 1 };
    case 'under': return { kind: 'step', round, step: 2 };
    case 'line': return { kind: 'step', round, step: 3 };
    case 'broughtDown': return round + 1 < rounds ? { kind: 'step', round: round + 1, step: 0 } : null;
  }
  return null;
}
