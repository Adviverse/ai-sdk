import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractKeywords } from './keywords.ts';

test('drops stopwords/filler and ranks topic words', () => {
  const kw = extractKeywords([
    { role: 'user', content: 'Hi! Can you please help me pick a running shoe for marathon training?' },
    { role: 'assistant', content: 'Sure. For marathon training, a cushioned running shoe works well.' },
  ]);
  assert.deepEqual(kw.slice(0, 4), ['running', 'shoe', 'marathon', 'training']); // in both turns, then first-seen order
  for (const stop of ['you', 'please', 'help', 'sure', 'for', 'can']) assert.ok(!kw.includes(stop), stop);
});

test('never emits URLs, emails, numbers or id-like tokens', () => {
  const kw = extractKeywords([
    'mail me at jane.doe@example.com or see https://secret.example.com/private?x=1 — order 123456 ref a1b2c3d4e5f6g7h8 kayak',
  ]);
  assert.deepEqual(kw, ['mail', 'order', 'ref', 'kayak']);
});

test('later turns outweigh earlier ones; respects max and turns', () => {
  const kw = extractKeywords(['python python', 'golang', 'golang', 'golang'], { max: 1 });
  assert.deepEqual(kw, ['golang']);
  assert.deepEqual(extractKeywords(['python', 'golang'], { turns: 1 }), ['golang']);
});

test('tokenizes like the engine: lowercase ascii alnum only', () => {
  assert.deepEqual(extractKeywords(['Best VPN for Netflix, React/Next.js']), ['vpn', 'netflix', 'react', 'next']);
});

test('empty / malformed input', () => {
  assert.deepEqual(extractKeywords([]), []);
  assert.deepEqual(extractKeywords([{ content: undefined as unknown as string }, '']), []);
});
