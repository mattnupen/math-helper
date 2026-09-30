import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planDivision, problemError, parseProblem, nextPos, prevPos, expectedValue,
  encodePos, decodePos, locate,
} from '../js/division.js';
import { numberWords, pluralWords } from '../js/words.js';
import { stepScript, introScript } from '../js/script.js';

const summary = (plan) => plan.rounds.map((r) => [r.number, r.q, r.product, r.diff, r.next]);

test('943 ÷ 3 works in three rounds', () => {
  const plan = planDivision(943, 3);
  assert.equal(plan.prefixLen, 1);
  assert.deepEqual(summary(plan), [[9, 3, 9, 0, 4], [4, 1, 3, 1, 13], [13, 4, 12, 1, null]]);
  assert.equal(plan.quotient, 314);
  assert.equal(plan.remainder, 1);
});

test('1074 ÷ 15 starts with 107', () => {
  const plan = planDivision(1074, 15);
  assert.equal(plan.prefixLen, 3);
  assert.deepEqual(summary(plan), [[107, 7, 105, 2, 24], [24, 1, 15, 9, null]]);
  assert.deepEqual(plan.rounds.map((r) => r.endIndex), [2, 3]);
});

test('a zero in the answer is its own round', () => {
  const plan = planDivision(612, 3);
  assert.deepEqual(plan.rounds.map((r) => r.q), [2, 0, 4]);
  assert.equal(plan.quotient, 204);
});

test('every plan rebuilds the true quotient and remainder', () => {
  for (const [a, b] of [[937, 5], [380, 16], [999999, 99], [100, 10], [5, 5], [1000, 7]]) {
    const plan = planDivision(a, b);
    const q = Number(plan.rounds.map((r) => r.q).join(''));
    assert.equal(q, Math.floor(a / b), `${a}/${b} quotient`);
    assert.equal(plan.rounds.at(-1).diff, a % b, `${a}/${b} remainder`);
  }
});

test('problemError explains bad input', () => {
  assert.equal(problemError('943', '3'), null);
  assert.match(problemError('', '3'), /both/);
  assert.match(problemError('9x', '3'), /digits/);
  assert.match(problemError('943', '1'), /2 or more/);
  assert.match(problemError('2', '3'), /bigger/);
  assert.match(problemError('1234567', '3'), /6 digits/);
  assert.deepEqual(parseProblem(' 943 ÷ 3 '), { dividend: 943, divisor: 3 });
  assert.equal(parseProblem('3/943'), null);
});

test('walking forward then back visits every step', () => {
  const plan = planDivision(943, 3);
  const seen = [];
  let pos = { kind: 'intro' };
  while (pos) { seen.push(encodePos(pos)); pos = nextPos(plan, pos); }
  assert.deepEqual(seen, [null, '1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3', '2.4', '3.1', '3.2', '3.3', '3.4', 'done']);
  const back = [];
  pos = { kind: 'done' };
  while (pos) { back.push(encodePos(pos)); pos = prevPos(plan, pos); }
  assert.deepEqual(back, [...seen].reverse());
});

test('decodePos rejects positions outside the problem', () => {
  const plan = planDivision(943, 3);
  assert.deepEqual(decodePos(plan, '2.3'), { kind: 'step', round: 1, step: 2 });
  assert.deepEqual(decodePos(plan, '4.1'), { kind: 'intro' });
  assert.deepEqual(decodePos(plan, 'nonsense'), { kind: 'intro' });
});

test('expectedValue matches each step', () => {
  const plan = planDivision(943, 3);
  const at = (round, step) => expectedValue(plan, { kind: 'step', round, step });
  assert.deepEqual([at(1, 0), at(1, 1), at(1, 2), at(1, 3)], [1, 3, 1, 13]);
  assert.equal(at(2, 3), null);
});

test('locate finds the step from marks on paper', () => {
  const plan = planDivision(943, 3);
  assert.deepEqual(locate(plan, 0, null), { kind: 'step', round: 0, step: 0 });
  assert.deepEqual(locate(plan, 2, 'top'), { kind: 'step', round: 1, step: 1 });
  assert.deepEqual(locate(plan, 2, 'under'), { kind: 'step', round: 1, step: 2 });
  assert.deepEqual(locate(plan, 2, 'line'), { kind: 'step', round: 1, step: 3 });
  assert.deepEqual(locate(plan, 2, 'broughtDown'), { kind: 'step', round: 2, step: 0 });
  assert.equal(locate(plan, 3, 'broughtDown'), null);
  assert.equal(locate(plan, 4, 'top'), null);
});

test('numbers are spoken as words', () => {
  assert.equal(numberWords(943), 'nine hundred forty-three');
  assert.equal(numberWords(1074), 'one thousand seventy-four');
  assert.equal(numberWords(999999), 'nine hundred ninety-nine thousand nine hundred ninety-nine');
  assert.equal(pluralWords(3), 'threes');
  assert.equal(pluralWords(6), 'sixes');
  assert.equal(pluralWords(20), 'twenties');
  assert.equal(pluralWords(15), 'fifteens');
});

test('the divide question uses the same words every round', () => {
  const plan = planDivision(943, 3);
  const text = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.show)).join('');
  const q = [0, 1, 2].map((r) => text(stepScript(plan, r, 0).blocks[0].parts));
  assert.deepEqual(q, Array(3).fill('How many 3s fit into your number?'));
  assert.match(text(stepScript(planDivision(1074, 15), 0, 0).blocks[1].parts), /15 does not fit into 1\. 15 does not fit into 10\. So start with 107\./);
  assert.match(text(introScript(plan).blocks[0].parts), /write 943 ÷ 3 on your paper/);
});
