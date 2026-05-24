// Diagnose whether Chromium can browse through a SOCKS5 proxy.
//
//   npm install   (pulls Playwright + the Chromium binary via postinstall)
//   PROXY_HOST=1.2.3.4 PROXY_PORT=1080 PROXY_USER=user PROXY_PASS=pass node proxy-test.js
//
// The telling result is the third test failing with:
//   "Browser does not support socks5 proxy authentication"
// which proves Chromium can't auth to a SOCKS5 proxy (see README for the fix).

const { chromium } = require('playwright');

const HOST = process.env.PROXY_HOST || '127.0.0.1';
const PORT = process.env.PROXY_PORT || '1080';
const USER = process.env.PROXY_USER || '';
const PASS = process.env.PROXY_PASS || '';
const TEST_URL = 'https://httpbin.org/ip';
const TIMEOUT = 15000;

async function test(label, launchOptions) {
  console.log(`\n=== ${label} ===`);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...launchOptions });
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);

    const res = await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
    const body = await page.textContent('body');
    console.log(`  Status : ${res.status()}`);
    console.log(`  Body   : ${body.trim().slice(0, 200)}`);
    console.log(`  RESULT : PASS`);
  } catch (err) {
    console.log(`  ERROR  : ${err.message.split('\n')[0]}`);
    console.log(`  RESULT : FAIL`);
  } finally {
    if (browser) await browser.close();
  }
}

(async () => {
  // 1. No proxy — baseline, should show your real IP.
  await test('NO PROXY (baseline)', {});

  // 2. Credentials in the URL — Chromium silently ignores SOCKS5 creds, so this fails.
  await test('WITH PROXY (creds in URL)', {
    proxy: { server: `socks5://${USER}:${PASS}@${HOST}:${PORT}` },
  });

  // 3. Credentials passed separately — Chromium refuses outright with a clear message.
  await test('WITH PROXY (creds separate)', {
    proxy: { server: `socks5://${HOST}:${PORT}`, username: USER, password: PASS },
  });
})();
