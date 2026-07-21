const { test, expect } = require('@playwright/test');
const path = require('path');
const { login } = require('../fixtures/auth');

// Drives every main page in the UI and saves a PROOF screenshot of each into
// results/screenshots/. Hard-fails only on real breakage (bounced to login or a
// blank page); JS console errors are attached to the report as evidence.
const SHOTS = path.join(__dirname, '..', '..', 'results', 'screenshots');

const ROUTES = [
  ['home', '/'],
  ['packages', '/packages'],
  ['clients', '/clients'],
  ['visas', '/visas'],
  ['departures', '/departures'],
  ['suppliers', '/suppliers'],
  ['expenses', '/expenses'],
  ['ledger', '/ledger'],
  ['cash-accounts', '/cash-accounts'],
  ['reports', '/reports'],
  ['airlines', '/airlines'],
  ['hotels-makkah', '/hotels-makkah'],
  ['currency', '/currency'],
];

test.describe('ui-pages', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  for (const [name, route] of ROUTES) {
    test(`page loads: ${route}`, async ({ page }, testInfo) => {
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800); // let data load / render

      await page.screenshot({ path: path.join(SHOTS, `ui__${name}.png`), fullPage: true });

      // Real failures: kicked back to login, or an empty screen.
      await expect(page, `should stay on ${route}, not bounce to /login`).not.toHaveURL(/\/login/);
      const bodyText = (await page.locator('body').innerText()).trim();
      expect(bodyText.length, `${route} should render content`).toBeGreaterThan(0);

      // Console errors are surfaced as evidence, not a hard fail (avoids noise
      // from transient API hiccups while still flagging them for review).
      if (errors.length) {
        testInfo.annotations.push({ type: 'console-error', description: `${route}\n${errors.slice(0, 10).join('\n')}` });
      }
    });
  }
});
