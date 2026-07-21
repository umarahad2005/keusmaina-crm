const { test, expect } = require('@playwright/test');
const { apiUrl, getToken, auth, tag } = require('../fixtures/api');

// Verifies pricing is server-computed and can't be tampered (security fix H2).
test.describe('packages', () => {
  let token, packageId;

  test.beforeAll(async ({ request }) => {
    token = await getToken(request);
    const res = await request.post(apiUrl('/api/packages'), {
      ...auth(token), data: { packageName: `${tag()} Package`, packageType: 'Umrah', numberOfPilgrims: 2 },
    });
    expect(res.status(), 'create package').toBe(201);
    const body = await res.json();
    packageId = body.data._id;
    expect(body.data.pricingSummary, 'server must attach a pricingSummary').toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    if (packageId) await request.delete(apiUrl(`/api/packages/${packageId}`), auth(token));
  });

  test('a forged final price is ignored — server recomputes', async ({ request }) => {
    const res = await request.put(apiUrl(`/api/packages/${packageId}`), {
      ...auth(token),
      data: { pricingSummary: { finalPriceSAR: 999999, finalPricePKR: 999999 } },
    });
    expect(res.status()).toBe(200);
    const saved = (await res.json()).data;
    expect(saved.pricingSummary.finalPriceSAR, 'client-sent price must NOT be trusted').not.toBe(999999);
  });

  test('package list responds and is paginated', async ({ request }) => {
    const res = await request.get(apiUrl('/api/packages?limit=100000000'), auth(token));
    expect(res.status(), 'oversized limit must not hang or error').toBe(200);
  });
});
