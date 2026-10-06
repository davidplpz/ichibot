import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('session store creates, updates, lists and deletes sessions', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ichibot-test-'));
  process.env.ICHIBOT_DATA_DIR = dataDir;

  const store = await import('../src/store.js');
  const state = store.loadStore();
  const session = store.createSession(state);

  store.appendToSession(state, session.id, { role: 'user', content: 'Hola' });
  store.updateTitleIfEmpty(state, session.id, 'Saludo');
  store.saveStore(state);

  const summary = store.listSessions(state);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].title, 'Saludo');
  assert.equal(summary[0].messageCount, 1);
  assert.match(readFileSync(join(dataDir, 'sessions.json'), 'utf8'), /Saludo/);

  assert.equal(store.deleteSession(state, session.id), true);
  assert.equal(store.deleteSession(state, session.id), false);
  assert.deepEqual(store.listSessions(state), []);
});

test('session titles do not get overwritten', async () => {
  const store = await import('../src/store.js');
  const state = { sessions: {} };
  const session = store.createSession(state);

  store.updateTitleIfEmpty(state, session.id, 'Primer título');
  store.updateTitleIfEmpty(state, session.id, 'Segundo título');

  assert.equal(store.getSession(state, session.id)?.title, 'Primer título');
});
