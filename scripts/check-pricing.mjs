#!/usr/bin/env node
// Проверяет именно публикуемый Lean-код и обещанный вывод, включая правки
// Promo в последних шагах. Запуск: node scripts/check-pricing.mjs (нужен Lean).
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import deck from '../src/code/discount-floor.ts';

const directory = mkdtempSync(join(tmpdir(), 'why-pricing-'));
const file = join(directory, 'Pricing.lean');
const parts = [];
const outputs = [];
const clean = (code) => code
  .replace(/\{\{\w+\}\}/g, '')
  .replace(/^\s*-- \[!code[^\n]*\n/gm, '');

function compile(code) {
  writeFileSync(file, code);
  const result = spawnSync('lean', [file], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

try {
  for (const step of deck) {
    if (!step.repeatsPrevious && !step.playground) {
      parts.push(clean(step.code));
      if (step.output && !step.output.includes('no errors')) outputs.push(step.output);
    }
    let source = parts.join('\n\n');
    for (const patch of step.playground ?? []) {
      assert.ok(source.includes(patch.find), `${step.id}: patch target exists`);
      source = source.replace(patch.find, patch.replace);
    }
    const result = compile(source);
    if (step.id === 'evolve') {
      assert.notEqual(result.status, 0, 'cashback requires a matching branch');
      assert.match(result.stdout, /Missing cases:[\s\S]*Promo\.cashback/);
    } else {
      assert.equal(result.status, 0, `${step.id}: ${result.stdout}${result.stderr}`);
      assert.equal(result.stdout.trim(), outputs.join('\n'), `${step.id}: displayed output`);
    }
  }

  // До исчерпания маржи семантика процентов и порядок механик сохраняются.
  // Эти случаи отличают последовательный расчёт от процентов с общего прайса.
  const regression = compile(parts.join('\n\n') + `
example : checkout sneakers [.percent 10, .percent 10] = 4050 := by decide
example : checkout sneakers [.fixed 500, .percent 10] = 4050 := by decide
example : checkout sneakers [.percent 10, .fixed 500] = 4000 := by decide
example : checkout sneakers [] = 5000 := by decide
example : checkout { price := 1000, cost := 3200 } [] = 3200 := by decide
example : checkout sneakers [.percent 200] = 3200 := by decide
example : stack sneakers.price promos = 2813 := by decide
example : checkout sneakers promos = 3200 := by decide
`);
  assert.equal(regression.status, 0, regression.stdout + regression.stderr);
  console.log(`ok    ${deck.length} Lean snapshots, displayed outputs, pricing regressions`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
