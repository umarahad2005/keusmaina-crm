const { expect } = require('@playwright/test');

// A dedicated test account in a NON-production database. The QA agents create and
// delete records, so never point this at live data.
const EMAIL = process.env.SQA_EMAIL || 'admin@keusmania.com';
const PASSWORD = process.env.SQA_PASSWORD || 'admin123';

// Log in through the UI and leave the page on the authenticated app.
// NOTE: selectors are intentionally resilient (first input + the password field
// by type). Adjust here if the login markup changes — every agent reuses this.
async function login(page, { email = EMAIL, password = PASSWORD } = {}) {
  await page.goto('/login');
  await page.locator('input').first().fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page, 'should leave /login after a valid sign-in').not.toHaveURL(/\/login/, { timeout: 15_000 });
}

module.exports = { login, EMAIL, PASSWORD };
