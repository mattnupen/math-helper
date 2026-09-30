// The coaching script. These words are fixed on purpose: students learn the
// questions by hearing the exact same words every time. Only the numbers
// that come from the problem itself change.
//
// Text is a list of parts. A string is shown and spoken as-is. An object
// { show, say } is shown one way and spoken another (e.g. "3s" -> "threes").

import { numberWords, pluralWords } from './words.js';

export const BEATS = [
  { key: 'divide', label: 'Divide', symbol: '÷' },
  { key: 'multiply', label: 'Multiply', symbol: '×' },
  { key: 'subtract', label: 'Subtract', symbol: '−' },
  { key: 'bringDown', label: 'Bring down', symbol: '↓' },
];

export const num = (v) => ({ show: String(v), say: numberWords(v), num: true });
export const nums = (v) => ({ show: `${v}s`, say: pluralWords(v), num: true });
const DIVIDED_BY = { show: '÷', say: 'divided by' };

// Tagged template: line`How many ${nums(3)} fit?` -> parts list
export function line(strings, ...values) {
  const parts = [];
  strings.forEach((s, i) => {
    if (s) parts.push(s);
    if (i < values.length) parts.push(values[i]);
  });
  return parts;
}

export function problemParts(plan) {
  return [num(plan.dividend), ' ', DIVIDED_BY, ' ', num(plan.divisor)];
}

function firstNumberContext(plan) {
  const { digits, prefixLen, divisor: d } = plan;
  if (prefixLen === 1) return line`Start with the first digit: ${num(digits[0])}.`;
  const parts = [];
  let v = 0;
  for (let i = 0; i < prefixLen - 1; i++) {
    v = v * 10 + digits[i];
    parts.push(...line`${num(d)} does not fit into ${num(v)}. `);
  }
  v = v * 10 + digits[prefixLen - 1];
  parts.push(...line`So start with ${num(v)}.`);
  return parts;
}

export function introScript(plan) {
  const count = plan.rounds.length;
  return {
    title: 'Get ready',
    blocks: [
      { kind: 'question', parts: line`First, write ${problemParts(plan)} on your paper. Leave lots of space under it.`.flat() },
      {
        kind: 'where',
        parts: line`This problem has ${num(count)} ${count === 1 ? 'round' : 'rounds'}. Every round has the same four steps: Divide, Multiply, Subtract, Bring down.`,
      },
    ],
  };
}

// Returns { blocks, tip, check } for one step of one round.
export function stepScript(plan, round, stepIndex) {
  const d = plan.divisor;
  const r = plan.rounds[round];
  const isLast = round === plan.rounds.length - 1;

  switch (BEATS[stepIndex].key) {
    case 'divide':
      return {
        blocks: [
          { kind: 'question', parts: line`How many ${nums(d)} fit into your number?` },
          {
            kind: 'context',
            parts: round === 0
              ? firstNumberContext(plan)
              : line`Your number is the one you made when you brought a digit down.`,
          },
          { kind: 'where', parts: line`Write the answer on top, above the last digit of your number.` },
        ],
        tip: line`Count by ${nums(d)}. Stop before you go past your number. If ${num(d)} does not fit at all, write ${num(0)} on top.`,
        check: 'How many fit?',
      };

    case 'multiply':
      return {
        blocks: [
          { kind: 'question', parts: line`What is your new top number times ${num(d)}?` },
          { kind: 'where', parts: line`Write the answer under your number. Line up the last digits.` },
        ],
        tip: line`Say the ${num(d)} times table, or count by ${nums(d)} that many times.`,
        check: 'What did you get?',
      };

    case 'subtract':
      return {
        blocks: [
          { kind: 'question', parts: line`What is your number minus the number under it?` },
          { kind: 'where', parts: line`Draw a line first. Write the answer under the line.` },
          { kind: 'selfcheck', parts: line`Check: is your answer smaller than ${num(d)}? If it is not, go back to Divide. ${num(d)} fits more times.` },
        ],
        tip: line`Start with the ones place. If the top digit is smaller, borrow from the next place.`,
        check: 'What did you get?',
      };

    case 'bringDown':
      if (isLast) {
        return {
          blocks: [
            { kind: 'question', parts: line`Is there a digit in the problem that you have not used yet?` },
            { kind: 'where', parts: line`No. Every digit is used. You are finished!` },
            { kind: 'context', parts: line`The number on top is your answer. The number at the very bottom is the remainder.` },
          ],
          tip: null,
          check: null,
        };
      }
      return {
        blocks: [
          { kind: 'question', parts: line`Is there a digit in the problem that you have not used yet?` },
          { kind: 'where', parts: line`Yes: the ${num(r.bringDigit)}. Bring it down. Write it next to your answer from Subtract.` },
        ],
        tip: line`Draw an arrow from the ${num(r.bringDigit)} straight down, so you keep your place.`,
        check: 'What is your new number?',
      };
  }
  throw new Error(`Unknown step ${stepIndex}`);
}

export function doneScript(plan) {
  return {
    title: 'You did it!',
    blocks: [
      { kind: 'question', parts: line`You finished ${problemParts(plan)}.`.flat() },
      { kind: 'where', parts: line`Read your answer. The number on top is the answer. If there is a number at the very bottom, that is the remainder.` },
    ],
  };
}

// "Where am I?" questions. Every one is answered by looking, not by doing math.
export const ladderScript = {
  count(plan) {
    const parts = line`Look above the division bar. How many digits have you written on top?`;
    if (plan.prefixLen > 1) parts.push(' Do not count zeros at the very front.');
    return parts;
  },
  mark: line`Look at the last thing you wrote. Which picture looks like your paper?`,
  marks: [
    { key: 'top', parts: line`I just wrote a new digit on top.` },
    { key: 'under', parts: line`I wrote a number under my number. No line yet.` },
    { key: 'line', parts: line`I drew a line and wrote a number under it.` },
    { key: 'broughtDown', parts: line`I brought a digit down next to that number.` },
  ],
  found(plan, pos) {
    const beat = BEATS[pos.step];
    return line`Found it! You are in round ${num(pos.round + 1)} of ${num(plan.rounds.length)}. Your next step is ${beat.label}.`;
  },
  lost: line`That's okay. Messy paper happens. Find a clean spot on your paper, write the problem again, and we will start it together.`,
};

export const feedback = {
  right: line`Yes! That matches. Go to the next step.`,
  wrong: line`Not quite. Look at your work again. Here is a tip.`,
  wrongNoTip: line`Not quite. Look at your work again.`,
  answerRight: line`Yes! Your answer matches.`,
  answerWrong: line`Not quite. Go back and check your work one round at a time.`,
};
