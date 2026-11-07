// Atlas P1: Yes on a hand Pay, then Stop or Back while the fingerprint is pending, then a late fingerprint yes.
// Nothing may be paid. Usage: node scripts/pay-cancel.mjs [url]   (PLAYWRIGHT=<path to playwright/index.mjs>)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const url = process.argv[2] || 'http://localhost:8093/?quiet';
const b = await chromium.launch();
let bad = 0;
for (const how of ['none', 'stop', 'back']) {
  const p = await b.newPage({ viewport: { width: 390, height: 757 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => {
    window.PublicKeyCredential = window.PublicKeyCredential || function () {};
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
    navigator.credentials.create = () => new Promise((r) => setTimeout(() => r({ rawId: new Uint8Array(4).buffer }), 1200)); // the fingerprint says yes after 1.2 s
  });
  await p.goto(url); await p.waitForSelector('html[data-ready="true"]');
  await p.evaluate(() => window.murmur.install('grocer')); await p.evaluate(() => window.murmur.open('grocer')); await p.waitForTimeout(300);
  await p.fill('#grocer-add', 'milk'); await p.click('#grocer-add-btn'); await p.waitForTimeout(200);
  await p.click('#grocer-order'); await p.waitForSelector('dialog[open]');
  await p.click('#sheet-yes'); await p.waitForTimeout(200);
  if (how === 'stop') await p.evaluate(() => window.murmur.host.verbs.stop());
  if (how === 'back') await p.goBack();
  await p.waitForTimeout(1800);
  const paid = await p.evaluate(() => window.murmur.bus.log.some((e) => e.name === 'confirm' && e.result));
  const ok = paid === (how === 'none') && !errs.length;
  if (!ok) bad++;
  console.log(ok ? 'ok  ' : 'FAIL', how === 'none' ? 'no Stop: the fingerprint pays' : `${how} before the fingerprint: nothing paid`, errs.join('|'));
  await p.close();
}
await b.close();
process.exit(bad ? 1 : 0);
