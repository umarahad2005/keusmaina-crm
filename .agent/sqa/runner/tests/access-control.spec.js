const { test, expect } = require('@playwright/test');
const { apiUrl, getToken, auth, tag } = require('../fixtures/api');

// Regression guard for the security sweep (middleware/roles.js): a non-finance
// role must be blocked from money endpoints, while reads stay open.
test.describe('access-control', () => {
  let adminToken, opsToken, opsUserId;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request);
    // Create a low-privilege 'operations' user and log in as them.
    const email = `${tag()}@sqa.test`.toLowerCase();
    const password = 'sqatest123';
    const reg = await request.post(apiUrl('/api/auth/register'), {
      ...auth(adminToken),
      data: { name: 'SQA Ops', email, password, role: 'operations' },
    });
    expect(reg.status(), 'admin should be able to register a user').toBe(201);
    opsUserId = (await reg.json()).data._id;
    opsToken = await getToken(request, email, password);
  });

  test.afterAll(async ({ request }) => {
    if (opsUserId) await request.delete(apiUrl(`/api/auth/users/${opsUserId}`), auth(adminToken));
  });

  test('operations role CANNOT create a cash account (403)', async ({ request }) => {
    const res = await request.post(apiUrl('/api/cash-accounts'), {
      ...auth(opsToken),
      data: { name: tag(), type: 'cash' },
    });
    expect(res.status(), 'non-finance create must be forbidden').toBe(403);
  });

  test('operations role CANNOT delete a ledger entry (403)', async ({ request }) => {
    const res = await request.delete(apiUrl('/api/ledger/000000000000000000000000'), auth(opsToken));
    expect(res.status(), 'non-finance ledger delete must be forbidden').toBe(403);
  });

  test('operations role CAN still read cash accounts (200)', async ({ request }) => {
    const res = await request.get(apiUrl('/api/cash-accounts'), auth(opsToken));
    expect(res.status(), 'reads should stay open').toBe(200);
  });

  test('unauthenticated request is rejected (401)', async ({ request }) => {
    const res = await request.get(apiUrl('/api/cash-accounts'));
    expect(res.status()).toBe(401);
  });
});
