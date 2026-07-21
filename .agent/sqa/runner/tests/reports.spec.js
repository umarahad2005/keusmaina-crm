const { test, expect } = require('@playwright/test');
const { apiUrl, getToken, auth } = require('../fixtures/api');

test.describe('reports', () => {
  let token;
  test.beforeAll(async ({ request }) => { token = await getToken(request); });

  test('dashboard overview loads', async ({ request }) => {
    const res = await request.get(apiUrl('/api/reports/overview'), auth(token));
    expect(res.status()).toBe(200);
  });

  test('cash-on-hand total is consistent across endpoints', async ({ request }) => {
    const list = await (await request.get(apiUrl('/api/cash-accounts'), auth(token))).json();
    const summary = await (await request.get(apiUrl('/api/cash-accounts/summary'), auth(token))).json();
    // Both derive from the same buildBalanceMap — the numbers must agree.
    expect(list.totalCashOnHand, 'list vs summary cash totals must match').toBe(summary.data.totalCashOnHand);
  });
});
