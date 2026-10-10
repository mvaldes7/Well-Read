#!/usr/bin/env node
// Task ledger CLI. Node 20+, zero dependencies.
// Usage: node scripts/ledger.mjs <command> [args] [--file <path>] [--actor <name>]
//   add <id> <title> --role <r> --type impl|other
//   start <id> --agent <name>
//   status <id> <state>
//   fail <id> --failure <key> --note <text>
//   list
//   validate
// Ledger path: --file, else LEDGER_PATH env, else tasks/ledger.json in the repo.
// Actor: --actor, else LEDGER_ACTOR env, else "cli".

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const STATES = [
  'Idea', 'Requirements Drafted', 'Scope Approved', 'Planned', 'In Progress',
  'Checks Passed', 'Reviewed', 'Preview Verified', 'Release Approved', 'Deployed',
  'Production Verified', 'Blocked', 'Changes Requested', 'Failed', 'Cancelled', 'Deferred',
];
const TYPES = ['impl', 'other'];
const ACTIONS = ['add', 'start', 'status', 'fail'];
const DEFAULT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tasks', 'ledger.json');

class LedgerError extends Error {}
const refuse = (msg) => { throw new LedgerError(msg); };

function load(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch (e) { refuse(`cannot read ledger ${path}: ${e.code || e.message}`); }
  try { return JSON.parse(raw); } catch (e) { refuse(`ledger ${path} is not valid JSON: ${e.message}`); }
}

function save(path, ledger) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n');
  renameSync(tmp, path);
}

function limitsOf(ledger) {
  const l = ledger.limits || {};
  if (!Number.isInteger(l.maxActiveImplementationTasks) || !Number.isInteger(l.maxRepairAttemptsPerFailure)) {
    refuse('ledger limits are missing or invalid; run validate');
  }
  return l;
}

function findTask(ledger, id) {
  const t = ledger.tasks.find((x) => x.id === id);
  if (!t) refuse(`task ${id} not found`);
  return t;
}

function activeImpl(ledger, exceptId) {
  return ledger.tasks.filter((t) => t.type === 'impl' && t.state === 'In Progress' && t.id !== exceptId);
}

function logEntry(ledger, actor, taskId, action, from, to, note) {
  ledger.log.push({ ts: new Date().toISOString(), actor, taskId, action, from, to, note: note ?? null });
}

function requireArg(value, name) {
  if (value === undefined || value === '') refuse(`missing required ${name}`);
  return value;
}

function checkImplCapacity(ledger, task, verb) {
  if (task.type !== 'impl') return;
  const { maxActiveImplementationTasks: max } = limitsOf(ledger);
  const others = activeImpl(ledger, task.id);
  if (others.length >= max) {
    refuse(`cannot ${verb} ${task.id}: ${others.length} impl task(s) already In Progress (${others.map((t) => t.id).join(', ')}); limit is ${max}`);
  }
}

export function validate(ledger) {
  const errors = [];
  if (ledger === null || typeof ledger !== 'object' || Array.isArray(ledger)) return ['ledger must be a JSON object'];
  if (!Number.isInteger(ledger.version)) errors.push('version must be an integer');
  const l = ledger.limits;
  if (!l || typeof l !== 'object') errors.push('limits must be an object');
  else {
    for (const k of ['maxActiveImplementationTasks', 'maxRepairAttemptsPerFailure']) {
      if (!Number.isInteger(l[k]) || l[k] < 0) errors.push(`limits.${k} must be a non-negative integer`);
    }
  }
  if (!Array.isArray(ledger.tasks)) errors.push('tasks must be an array');
  if (!Array.isArray(ledger.log)) errors.push('log must be an array');
  if (errors.length) return errors;

  const ids = new Set();
  ledger.tasks.forEach((t, i) => {
    const where = `tasks[${i}]${t && t.id ? ` (${t.id})` : ''}`;
    if (!t || typeof t !== 'object') { errors.push(`${where} must be an object`); return; }
    if (typeof t.id !== 'string' || !t.id) errors.push(`${where}: id must be a non-empty string`);
    else if (ids.has(t.id)) errors.push(`${where}: duplicate id`);
    else ids.add(t.id);
    if (typeof t.title !== 'string' || !t.title) errors.push(`${where}: title must be a non-empty string`);
    if (typeof t.role !== 'string' || !t.role) errors.push(`${where}: role must be a non-empty string`);
    if (!TYPES.includes(t.type)) errors.push(`${where}: type must be one of ${TYPES.join('|')}`);
    if (!STATES.includes(t.state)) errors.push(`${where}: invalid state "${t.state}"`);
    if (t.agent !== null && typeof t.agent !== 'string') errors.push(`${where}: agent must be a string or null`);
    if (!t.attempts || typeof t.attempts !== 'object' || Array.isArray(t.attempts)) errors.push(`${where}: attempts must be an object`);
    else for (const [k, v] of Object.entries(t.attempts)) {
      if (!Number.isInteger(v) || v < 1) errors.push(`${where}: attempts["${k}"] must be a positive integer`);
      if (l && Number.isInteger(v) && v > l.maxRepairAttemptsPerFailure && t.state !== 'Blocked' && !['Cancelled', 'Deferred', 'Failed'].includes(t.state)) {
        errors.push(`${where}: attempts["${k}"]=${v} exceeds limit ${l.maxRepairAttemptsPerFailure} but task is not Blocked`);
      }
    }
  });
  const active = ledger.tasks.filter((t) => t && t.type === 'impl' && t.state === 'In Progress');
  if (active.length > l.maxActiveImplementationTasks) {
    errors.push(`${active.length} impl tasks In Progress (${active.map((t) => t.id).join(', ')}); limit is ${l.maxActiveImplementationTasks}`);
  }
  ledger.log.forEach((e, i) => {
    const where = `log[${i}]`;
    if (!e || typeof e !== 'object') { errors.push(`${where} must be an object`); return; }
    const keys = ['ts', 'actor', 'taskId', 'action', 'from', 'to', 'note'];
    for (const k of keys) if (!(k in e)) errors.push(`${where}: missing ${k}`);
    if (typeof e.ts !== 'string' || Number.isNaN(Date.parse(e.ts)) || new Date(e.ts).toISOString() !== e.ts) errors.push(`${where}: ts must be an ISO timestamp`);
    if (typeof e.actor !== 'string' || !e.actor) errors.push(`${where}: actor must be a non-empty string`);
    if (typeof e.taskId !== 'string' || !e.taskId) errors.push(`${where}: taskId must be a non-empty string`);
    else if (!ids.has(e.taskId)) errors.push(`${where}: taskId ${e.taskId} not in tasks`);
    if (!ACTIONS.includes(e.action)) errors.push(`${where}: action must be one of ${ACTIONS.join('|')}`);
    for (const k of ['from', 'to']) if (e[k] !== null && !STATES.includes(e[k])) errors.push(`${where}: ${k} must be a valid state or null`);
    if (e.note !== null && typeof e.note !== 'string') errors.push(`${where}: note must be a string or null`);
  });
  return errors;
}

function run(argv) {
  const { values: o, positionals: p } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      file: { type: 'string' }, actor: { type: 'string' }, role: { type: 'string' },
      type: { type: 'string' }, agent: { type: 'string' }, failure: { type: 'string' }, note: { type: 'string' },
    },
  });
  const [cmd, ...args] = p;
  const path = resolve(o.file || process.env.LEDGER_PATH || DEFAULT_PATH);
  const actor = o.actor || process.env.LEDGER_ACTOR || 'cli';
  if (!cmd) refuse('usage: ledger.mjs <add|start|status|fail|list|validate> ...');

  const ledger = load(path);
  if (cmd === 'validate') {
    const errors = validate(ledger);
    if (errors.length) {
      for (const e of errors) process.stderr.write(`invalid: ${e}\n`);
      return 1;
    }
    process.stdout.write(`ledger OK: ${path} (${ledger.tasks.length} tasks, ${ledger.log.length} log entries)\n`);
    return 0;
  }
  const pre = validate(ledger);
  if (pre.length) refuse(`ledger is invalid, refusing ${cmd}: ${pre[0]}${pre.length > 1 ? ` (+${pre.length - 1} more)` : ''}`);

  if (cmd === 'list') {
    for (const t of ledger.tasks) {
      const att = Object.entries(t.attempts).map(([k, v]) => `${k}=${v}`).join(',');
      process.stdout.write(`${t.id}\t${t.state}\t${t.type}\t${t.role}\t${t.agent ?? '-'}\t${att || '-'}\t${t.title}\n`);
    }
    return 0;
  }

  const id = requireArg(args[0], '<id>');
  if (cmd === 'add') {
    const title = requireArg(args[1], '<title>');
    const role = requireArg(o.role, '--role');
    const type = requireArg(o.type, '--type');
    if (!TYPES.includes(type)) refuse(`invalid --type "${type}"; expected ${TYPES.join('|')}`);
    if (ledger.tasks.some((t) => t.id === id)) refuse(`task ${id} already exists`);
    ledger.tasks.push({ id, title, role, type, state: 'Idea', agent: null, attempts: {} });
    logEntry(ledger, actor, id, 'add', null, 'Idea', o.note);
  } else if (cmd === 'start') {
    const agent = requireArg(o.agent, '--agent');
    const t = findTask(ledger, id);
    if (t.state === 'Blocked') refuse(`cannot start ${id}: task is Blocked`);
    if (t.state === 'In Progress') refuse(`cannot start ${id}: already In Progress`);
    checkImplCapacity(ledger, t, 'start');
    const from = t.state;
    t.state = 'In Progress';
    t.agent = agent;
    logEntry(ledger, actor, id, 'start', from, t.state, o.note ?? `agent=${agent}`);
  } else if (cmd === 'status') {
    const state = requireArg(args[1], '<state>');
    if (!STATES.includes(state)) refuse(`invalid state "${state}"; allowed: ${STATES.join(', ')}`);
    const t = findTask(ledger, id);
    if (state === 'In Progress') checkImplCapacity(ledger, t, 'move to In Progress');
    const from = t.state;
    t.state = state;
    logEntry(ledger, actor, id, 'status', from, state, o.note);
  } else if (cmd === 'fail') {
    const key = requireArg(o.failure, '--failure');
    const note = requireArg(o.note, '--note');
    const t = findTask(ledger, id);
    const { maxRepairAttemptsPerFailure: max } = limitsOf(ledger);
    const n = (t.attempts[key] || 0) + 1;
    t.attempts[key] = n;
    const from = t.state;
    if (n > max) t.state = 'Blocked';
    logEntry(ledger, actor, id, 'fail', from, t.state, `[${key} attempt ${n}/${max}${n > max ? ', limit exceeded -> Blocked' : ''}] ${note}`);
    if (n > max) process.stderr.write(`task ${id} Blocked: failure "${key}" occurred ${n} times (limit ${max})\n`);
  } else {
    refuse(`unknown command "${cmd}"`);
  }
  save(path, ledger);
  const t = ledger.tasks.find((x) => x.id === id);
  process.stdout.write(`${cmd} ${id}: state=${t.state}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (e) {
    if (e instanceof LedgerError || e.code?.startsWith?.('ERR_PARSE_ARGS')) {
      process.stderr.write(`ledger: ${e.message}\n`);
      process.exitCode = 2;
    } else throw e;
  }
}
