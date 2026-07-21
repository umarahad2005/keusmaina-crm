const { test, expect } = require('@playwright/test');
const { apiUrl, getToken, auth, tag } = require('../fixtures/api');

// Highest-priority module: verifies the cash-balance + refund fixes end-to-end.
test.describe('finance', () => {
  let token, accountId, clientId;

  const balanceOf = async (request, id) => {
    const res = await request.get(apiUrl(`/api/cash-accounts/${id}`), auth(token));
    expect(res.ok()).toBeTruthy();
    return (await res.json()).data;
  };

  test.beforeAll(async ({ request }) => {
    token = await getToken(request);
    const acc = await request.post(apiUrl('/api/cash-accounts'), {
      ...auth(token), data: { name: `${tag()} Cash`, type: 'cash', openingBalancePKR: 0 },
    });
    expect(acc.status(), 'create cash account').toBe(201);
    accountId = (await acc.json()).data._id;

    const cli = await request.post(apiUrl('/api/clients/b2c'), {
      ...auth(token), data: { fullName: `${tag()} Pilgrim`, gender: 'Male', phone: '03000000000' },
    });
    expect(cli.status(), 'create test client').toBe(201);
    clientId = (await cli.json()).data._id;
  });

  test.afterAll(async ({ request }) => {
    if (accountId) await request.delete(apiUrl(`/api/cash-accounts/${accountId}`), auth(token));
    if (clientId) await request.delete(apiUrl(`/api/clients/b2c/${clientId}`), auth(token));
  });

  const ledger = (data) => ({ ...auth(token), data: {
    client: clientId, clientModel: 'ClientB2C', clientType: 'B2C',
    currency: 'PKR', paymentMethod: 'cash', description: tag(), ...data,
  }});

  test('a client payment increases the account balance', async ({ request }) => {
    const res = await request.post(apiUrl('/api/ledger'), ledger({ type: 'credit', amount: 50000, category: 'package_sale', cashAccount: accountId }));
    expect(res.status(), 'record payment').toBe(201);
    const acc = await balanceOf(request, accountId);
    expect(acc.balancePKR, 'balance should be +50000 after payment').toBe(50000);
  });

  test('a refund decreases the account balance', async ({ request }) => {
    const res = await request.post(apiUrl('/api/ledger'), ledger({ type: 'debit', amount: 20000, category: 'refund', cashAccount: accountId }));
    expect(res.status(), 'record refund').toBe(201);
    const acc = await balanceOf(request, accountId);
    expect(acc.balancePKR, 'balance should be 30000 after a 20000 refund').toBe(30000);
  });

  test('detail running balance matches the summary balance', async ({ request }) => {
    const acc = await balanceOf(request, accountId);
    // Newest transaction first → its running balance is the latest = summary balance.
    const latest = acc.transactions?.[0]?.runningBalancePKR;
    expect(latest, 'feed running balance must equal the account balance').toBe(acc.balancePKR);
  });

  test('a refund without an account is rejected (400)', async ({ request }) => {
    const res = await request.post(apiUrl('/api/ledger'), ledger({ type: 'debit', amount: 1000, category: 'refund' }));
    expect(res.status(), 'refund must require a cash account').toBe(400);
  });
});
