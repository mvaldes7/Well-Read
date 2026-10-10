import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'ledger.mjs');
const EMPTY = { version: 1, limits: { maxActiveImplementationTasks: 1, maxRepairAttemptsPerFailure: 2 }, tasks: [], log: [] };

let dir, file;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ledger-test-'));
  file = join(dir, 'ledger.json');
  writeFileSync(file, JSON.stringify(EMPTY, null, 2));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function cli(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, LEDGER_PATH: file, LEDGER_ACTOR: 'test-actor' },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const read = () => JSON.parse(readFileSync(file, 'utf8'));
const raw = () => readFileSync(file, 'utf8');
function ok(...args) {
  const r = cli(...args);
  assert.equal(r.code, 0, `expected success for ${args.join(' ')}: ${r.err}`);
  return r;
}
function refused(...args) {
  const before = raw();
  const r = cli(...args);
  assert.notEqual(r.code, 0, `expected refusal for ${args.join(' ')}`);
  assert.match(r.err, /\S/, 'expected a stderr message');
  assert.equal(raw(), before, 'ledger must be unchanged after refusal');
  return r;
}

test('add creates a task in Idea state and logs it', () => {
  ok('add', 'T1', 'First task', '--role', 'builder', '--type', 'impl');
  const l = read();
  assert.deepEqual(l.tasks, [{ id: 'T1', title: 'First task', role: 'builder', type: 'impl', state: 'Idea', agent: null, attempts: {} }]);
  assert.equal(l.log.length, 1);
  const e = l.log[0];
  assert.deepEqual(Object.keys(e).sort(), ['action', 'actor', 'from', 'note', 'taskId', 'to', 'ts']);
  assert.equal(e.actor, 'test-actor');
  assert.equal(e.action, 'add');
  assert.equal(e.taskId, 'T1');
  assert.equal(e.from, null);
  assert.equal(e.to, 'Idea');
  assert.equal(new Date(e.ts).toISOString(), e.ts);
});

test('add refuses duplicate ids and bad types', () => {
  ok('add', 'T1', 'First', '--role', 'builder', '--type', 'impl');
  refused('add', 'T1', 'Again', '--role', 'builder', '--type', 'impl');
  refused('add', 'T2', 'Bad type', '--role', 'builder', '--type', 'feature');
  refused('add', 'T3', 'No role', '--type', 'impl');
});

test('--actor flag overrides LEDGER_ACTOR', () => {
  ok('add', 'T1', 'First', '--role', 'builder', '--type', 'other', '--actor', 'mike');
  assert.equal(read().log[0].actor, 'mike');
});

test('start refuses a second impl task while one is In Progress', () => {
  ok('add', 'T1', 'One', '--role', 'builder', '--type', 'impl');
  ok('add', 'T2', 'Two', '--role', 'builder', '--type', 'impl');
  ok('add', 'T3', 'Docs', '--role', 'pl', '--type', 'other');
  ok('start', 'T1', '--agent', 'builder-1');
  const r = refused('start', 'T2', '--agent', 'builder-2');
  assert.match(r.err, /already In Progress.*T1.*limit is 1/);
  // also via status
  refused('status', 'T2', 'In Progress');
  // non-impl tasks are not limited
  ok('start', 'T3', '--agent', 'pl-1');
  // once T1 leaves In Progress, T2 can start
  ok('status', 'T1', 'Checks Passed');
  ok('start', 'T2', '--agent', 'builder-2');
  const t2 = read().tasks.find((t) => t.id === 'T2');
  assert.equal(t2.state, 'In Progress');
  assert.equal(t2.agent, 'builder-2');
});

test('fail increments attempts per key; 3rd failure on same key blocks and start is refused', () => {
  ok('add', 'T1', 'One', '--role', 'builder', '--type', 'impl');
  ok('start', 'T1', '--agent', 'builder-1');
  ok('fail', 'T1', '--failure', 'unit-tests', '--note', 'first');
  ok('fail', 'T1', '--failure', 'unit-tests', '--note', 'second');
  ok('fail', 'T1', '--failure', 'lint', '--note', 'other key');
  let t = read().tasks[0];
  assert.deepEqual(t.attempts, { 'unit-tests': 2, lint: 1 });
  assert.equal(t.state, 'In Progress');
  const r = ok('fail', 'T1', '--failure', 'unit-tests', '--note', 'third');
  assert.match(r.err, /Blocked/);
  t = read().tasks[0];
  assert.equal(t.attempts['unit-tests'], 3);
  assert.equal(t.state, 'Blocked');
  const last = read().log.at(-1);
  assert.equal(last.action, 'fail');
  assert.equal(last.from, 'In Progress');
  assert.equal(last.to, 'Blocked');
  assert.match(last.note, /unit-tests attempt 3\/2.*third/);
  const s = refused('start', 'T1', '--agent', 'builder-1');
  assert.match(s.err, /Blocked/);
});

test('fail requires --failure and --note', () => {
  ok('add', 'T1', 'One', '--role', 'builder', '--type', 'impl');
  refused('fail', 'T1', '--note', 'x');
  refused('fail', 'T1', '--failure', 'k');
});

test('invalid state, unknown task, and unknown command are refused', () => {
  ok('add', 'T1', 'One', '--role', 'builder', '--type', 'impl');
  const r = refused('status', 'T1', 'Done');
  assert.match(r.err, /invalid state "Done"/);
  refused('status', 'NOPE', 'Planned');
  refused('frobnicate', 'T1');
  refused('status', 'T1', 'Planned', '--bogus-flag', 'x');
});

test('every mutation appends a well-formed log entry', () => {
  ok('add', 'T1', 'One', '--role', 'builder', '--type', 'impl');
  ok('status', 'T1', 'Planned', '--note', 'planned it');
  ok('start', 'T1', '--agent', 'b');
  ok('fail', 'T1', '--failure', 'k', '--note', 'n');
  const log = read().log;
  assert.deepEqual(log.map((e) => [e.action, e.from, e.to]), [
    ['add', null, 'Idea'],
    ['status', 'Idea', 'Planned'],
    ['start', 'Planned', 'In Progress'],
    ['fail', 'In Progress', 'In Progress'],
  ]);
  assert.equal(log[1].note, 'planned it');
  for (const e of log) {
    assert.equal(e.actor, 'test-actor');
    assert.equal(e.taskId, 'T1');
    assert.equal(new Date(e.ts).toISOString(), e.ts);
  }
});

test('list prints tasks', () => {
  ok('add', 'T1', 'One', '--role', 'builder', '--type', 'impl');
  const r = ok('list');
  assert.match(r.out, /^T1\tIdea\timpl\tbuilder/m);
});

test('validate passes on a valid ledger', () => {
  ok('validate');
  ok('add', 'T1', 'One', '--role', 'builder', '--type', 'impl');
  ok('start', 'T1', '--agent', 'b');
  ok('validate');
});

test('validate fails on schema, state, id, type, limit and log problems', () => {
  const cases = {
    'missing limits': { ...EMPTY, limits: undefined },
    'tasks not array': { ...EMPTY, tasks: {} },
    'bad state': { ...EMPTY, tasks: [{ id: 'A', title: 't', role: 'r', type: 'impl', state: 'Done', agent: null, attempts: {} }] },
    'duplicate id': { ...EMPTY, tasks: [
      { id: 'A', title: 't', role: 'r', type: 'other', state: 'Idea', agent: null, attempts: {} },
      { id: 'A', title: 't', role: 'r', type: 'other', state: 'Idea', agent: null, attempts: {} }] },
    'bad type': { ...EMPTY, tasks: [{ id: 'A', title: 't', role: 'r', type: 'x', state: 'Idea', agent: null, attempts: {} }] },
    'too many active impl': { ...EMPTY, tasks: [
      { id: 'A', title: 't', role: 'r', type: 'impl', state: 'In Progress', agent: 'a', attempts: {} },
      { id: 'B', title: 't', role: 'r', type: 'impl', state: 'In Progress', agent: 'b', attempts: {} }] },
    'attempts over limit but not blocked': { ...EMPTY, tasks: [{ id: 'A', title: 't', role: 'r', type: 'impl', state: 'Planned', agent: null, attempts: { k: 3 } }] },
    'bad log entry': { ...EMPTY,
      tasks: [{ id: 'A', title: 't', role: 'r', type: 'other', state: 'Idea', agent: null, attempts: {} }],
      log: [{ ts: 'yesterday', actor: '', taskId: 'A', action: 'add', from: null }] },
  };
  for (const [name, ledger] of Object.entries(cases)) {
    writeFileSync(file, JSON.stringify(ledger));
    const r = cli('validate');
    assert.notEqual(r.code, 0, `validate should fail: ${name}`);
    assert.match(r.err, /invalid:/, name);
  }
  writeFileSync(file, '{not json');
  assert.notEqual(cli('validate').code, 0);
});

test('mutations are refused on an invalid ledger', () => {
  writeFileSync(file, JSON.stringify({ ...EMPTY, tasks: [{ id: 'A', title: 't', role: 'r', type: 'impl', state: 'Done', agent: null, attempts: {} }] }));
  refused('add', 'T1', 'One', '--role', 'builder', '--type', 'impl');
});
