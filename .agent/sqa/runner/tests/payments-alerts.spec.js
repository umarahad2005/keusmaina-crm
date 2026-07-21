const { test, expect } = require('@playwright/test');
const { apiUrl, getToken, auth } = require('../fixtures/api');

// The payment-before-travel board.
test.describe('payments-alerts', () => {
  let token;
  test.beforeAll(async ({ request }) => { token = await getToken(request); });

  test('GET /api/reports/payment-alerts returns the expected shape', async ({ request }) => {
    const res = await request.get(apiUrl('/api/reports/payment-alerts'), auth(token));
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(Array.isArray(data.alerts), 'alerts should be an array').toBeTruthy();
    expect(data.summary, 'summary should exist').toBeTruthy();
    expect(typeof data.summary.totalOutstandingPKR).toBe('number');
    // Every listed alert must actually owe money and carry an urgency level.
    for (const a of data.alerts) {
      expect(a.remainingPKR, `alert ${a.voucherId} should owe > 0`).toBeGreaterThan(0);
      expect(['overdue', 'due_soon', 'pending']).toContain(a.level);
    }
  });
});
