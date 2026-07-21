const { test, expect } = require('@playwright/test');
const { apiUrl, getToken, auth, tag } = require('../fixtures/api');

test.describe('departures', () => {
  let token, depId;
  test.beforeAll(async ({ request }) => { token = await getToken(request); });
  test.afterAll(async ({ request }) => { if (depId) await request.delete(apiUrl(`/api/departures/${depId}`), auth(token)); });

  test('create a departure with an auto code', async ({ request }) => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const res = await request.post(apiUrl('/api/departures'), {
      ...auth(token), data: { name: `${tag()} Departure`, travelDates: { departure: future } },
    });
    expect(res.status(), 'create departure').toBe(201);
    const data = (await res.json()).data;
    depId = data._id;
    expect(data.code, 'departure code should be generated').toBeTruthy();
  });

  test('manifest and profit endpoints respond', async ({ request }) => {
    expect((await request.get(apiUrl(`/api/departures/${depId}/manifest`), auth(token))).status(), 'manifest').toBe(200);
    expect((await request.get(apiUrl(`/api/departures/${depId}/profit`), auth(token))).status(), 'profit').toBe(200);
  });
});
