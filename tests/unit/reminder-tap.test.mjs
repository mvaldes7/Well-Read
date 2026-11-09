import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://well-read.test";

function load(windows) {
  const listeners = {}, opened = [], cachePuts = [];
  const caches = { open: async () => ({ put: async (k, v) => cachePuts.push([k, await v.text()]) }) };
  const context = { URL, Response, Date, String, self: { location: { origin: ORIGIN }, caches,
    addEventListener: (name, cb) => { listeners[name] = cb; },
    clients: { matchAll: async () => windows, openWindow: async url => opened.push(url) },
  } };
  vm.runInNewContext(sw, context);
  return { listeners, opened, cachePuts };
}
async function tap(listeners) {
  let done;
  listeners.notificationclick({ notification: { close() {}, data: { url: "https://evil.test" } }, waitUntil: p => { done = p; } });
  await done;
}
function windowOn(path, navigate) {
  const w = { url: `${ORIGIN}${path}`, focused: 0, messages: [], navigatedTo: [],
    focus: async () => { w.focused++; return w; },
    postMessage: m => w.messages.push(m) };
  if (navigate) w.navigate = async url => navigate(w, url);
  return w;
}

test("tap with the app open on Account focuses it and navigates to /learn", async () => {
  const w = windowOn("/account", async (self, url) => { self.navigatedTo.push(url); return self; });
  const { listeners, opened, cachePuts } = load([w]);
  await tap(listeners);
  assert.deepEqual(w.navigatedTo, [`${ORIGIN}/learn`]);
  assert.equal(w.focused, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(w.messages)), [{ type: "well-read:open-learn" }]);
  assert.deepEqual(opened, []);
  assert.deepEqual(cachePuts.map(p => p[0]), ["/__reminder-tap", "/__reminder-last-tap"]);
});

test("if navigate() rejects (iOS / uncontrolled), the page is told and /learn is opened", async () => {
  const w = windowOn("/account", async () => { throw new TypeError("not controlled"); });
  const { listeners, opened } = load([w]);
  await tap(listeners);
  assert.deepEqual(JSON.parse(JSON.stringify(w.messages)), [{ type: "well-read:open-learn" }]);
  assert.deepEqual(opened, [`${ORIGIN}/learn`]);
});

test("if navigate is missing and the page is not on /learn, /learn is opened", async () => {
  const w = windowOn("/account");
  const { listeners, opened } = load([w]);
  await tap(listeners);
  assert.deepEqual(opened, [`${ORIGIN}/learn`]);
});

test("closed app opens same-origin /learn and ignores payload URLs", async () => {
  const { listeners, opened } = load([{ url: "https://other.test/x" }]);
  await tap(listeners);
  assert.deepEqual(opened, [`${ORIGIN}/learn`]);
});

test("root layout mounts the tap listener on every page", () => {
  const layout = readFileSync(new URL("../../src/app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<ReminderTapListener \/>/);
  const listener = readFileSync(new URL("../../src/components/ReminderTapListener.tsx", import.meta.url), "utf8");
  assert.match(listener, /well-read:open-learn/);
  assert.match(listener, /__reminder-tap/);
  assert.match(listener, /window\.location\.assign\(new URL\("\/learn", window\.location\.origin\)\.href\)/);
  assert.match(listener, /getRegistration\("\/"\)\)\?\.update\(\)/);
  assert.match(listener, /visibilitychange/);
});

test("service worker takes over immediately and reports its version without personal data", async () => {
  assert.match(sw, /addEventListener\("install", \(\) => self\.skipWaiting\(\)\)/);
  assert.match(sw, /clients\.claim\(\)/);
  const { listeners } = load([]);
  let reply, done;
  listeners.message({ data: { type: "well-read:sw-version" }, ports: [{ postMessage: m => { reply = m; } }], waitUntil: p => { done = p; } });
  await done;
  assert.match(reply.version, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.deepEqual(Object.keys(reply).sort(), ["lastTapAt", "version"]);
});

test("registration skips the HTTP cache and Account shows the worker version", () => {
  const ui = readFileSync(new URL("../../src/components/LessonReminder.tsx", import.meta.url), "utf8");
  assert.match(ui, /updateViaCache: "none"/);
  assert.match(ui, /<ReminderWorkerStatus \/>/);
});
