const { test, expect } = require('@playwright/test');
const { login } = require('../fixtures/auth');

// SEED TESTS — copy this shape to add each QA agent from agents/qa-agents.md.
// One `test(...)` = one QA check. A failure auto-saves a screenshot into
// results/ as the proof handed to the fix agents.

test.describe('api-health', () => {
  test('GET /api/health returns success within 10s', async ({ request }) => {
    const res = await request.get('/api/health', { timeout: 10_000 });
    expect(res.status(), 'health endpoint should respond 200').toBe(200);
    const body = await res.json();
    expect(body.success, 'health body.success should be true').toBeTruthy();
  });
});

test.describe('auth', () => {
  test('valid admin login reaches the app', async ({ page }) => {
    await login(page);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('wrong password is rejected and stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input').first().fill('admin@keusmania.com');
    await page.locator('input[type="password"]').fill('definitely-wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
