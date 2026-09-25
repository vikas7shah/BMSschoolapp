#!/usr/bin/env node
/**
 * The four opt-in screens for the toll-free SMS registration, captured from
 * the live app as the Sample Parent test family (email on the SES simulator, so no
 * real inbox gets the sign-in code): sign in → You with Text off → Text on →
 * the SMS terms. Writes step1–4.png to the directory given (default ./out).
 *
 *   node scripts/optin-screenshots.mjs /tmp/shots
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { REGION, stackOutputs } from './lib/stack.mjs';

const dir = process.argv[2] ?? 'out';
mkdirSync(dir, { recursive: true });
const { AppUrl: base, CreateAuthChallengeLogGroup: logGroupName } = await stackOutputs();
const EMAIL = 'success+test1@simulator.amazonses.com';

// Sign in by email and read the code back from the sign-in function's log.
const since = Date.now() - 2000;
const start = await fetch(`${base}/api/auth/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: EMAIL }) }).then((r) => r.json());
const logs = new CloudWatchLogsClient({ region: REGION });
let code;
for (let t = 0; t < 12 && !code; t++) {
  await new Promise((r) => setTimeout(r, 5000));
  const r = await logs.send(new FilterLogEventsCommand({ logGroupName, filterPattern: '"Sign-in code issued for"', startTime: since }));
  code = (r.events ?? []).map((e) => /via EMAIL: (\d{6})/.exec(e.message ?? '')?.[1]).filter(Boolean).pop();
}
const v = await fetch(`${base}/api/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: EMAIL, code, session: start.session }) });
const cookie = (v.headers.get('set-cookie') ?? '').split(';')[0].split('=').slice(1).join('=');
if (!v.ok || !cookie) throw new Error('Test sign-in failed');

const profile = `${dir}/.chrome`;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 7000));
const tabs = await fetch('http://127.0.0.1:9333/json').then((r) => r.json());
const ws = new WebSocket(tabs.find((x) => x.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name, height) => {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 390, height, scale: 2 } });
  writeFileSync(`${dir}/${name}`, Buffer.from(s.data, 'base64'));
};
const host = new URL(base).hostname;
const toggle = (on) => send('Runtime.evaluate', { expression: `(() => { const b = [...document.querySelectorAll('button[role=switch]')].find((x) => /text message/i.test(x.getAttribute('aria-label') || '')); if (b && (b.getAttribute('aria-checked') === 'true') !== ${on}) b.click(); })()` });

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `${base}/login/` }); await wait(5000); await shot('step1.png', 820);
await send('Network.setCookie', { name: 'bms_session', value: cookie, domain: host, path: '/', secure: true, httpOnly: true });
await send('Page.navigate', { url: `${base}/me/` }); await wait(6000);
// Stop above the email field: the test account's address is not the point.
await toggle(false); await wait(2500); await shot('step2.png', 560);
await toggle(true); await wait(3500); await shot('step3.png', 560);
await toggle(false); await wait(2500);
await send('Page.navigate', { url: `${base}/sms-terms/` }); await wait(5000); await shot('step4.png', 640);
chrome.kill();
console.log(`Saved step1–4.png in ${dir}`);
