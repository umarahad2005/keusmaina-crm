const { test, expect } = require('@playwright/test');
const { apiUrl, getToken, auth } = require('../fixtures/api');

test.describe('visas', () => {
  let token;
  test.beforeAll(async ({ request }) => { token = await getToken(request); });

  test('visa board loads with status counts', async ({ request }) => {
    const res = await request.get(apiUrl('/api/visas'), auth(token));
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data), 'visa rows should be an array').toBeTruthy();
    expect(body.statusCounts, 'statusCounts should be present').toBeTruthy();
  });

  test('visa board filters by status without error', async ({ request }) => {
    const res = await request.get(apiUrl('/api/visas?status=visa_issued'), auth(token));
    expect(res.status()).toBe(200);
  });
});
