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
    // Both endpoints read the same active-account set from buildBalanceMap, so
    // they must agree. Poll so a concurrent spec mutating data between the two
    // reads can't cause a false mismatch.
    await expect.poll(async () => {
      const list = await (await request.get(apiUrl('/api/cash-accounts'), auth(token))).json();
      const summary = await (await request.get(apiUrl('/api/cash-accounts/summary'), auth(token))).json();
      return list.totalCashOnHand - summary.data.totalCashOnHand;
    }, { message: 'list vs summary cash totals must match', timeout: 10_000, intervals: [400, 800, 1200] }).toBe(0);
  });
});
