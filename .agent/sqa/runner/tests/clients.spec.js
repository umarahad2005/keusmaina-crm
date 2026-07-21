const { test, expect } = require('@playwright/test');
const { apiUrl, getToken, auth, tag } = require('../fixtures/api');

test.describe('clients', () => {
  let token, b2cId, b2bId;
  test.beforeAll(async ({ request }) => { token = await getToken(request); });
  test.afterAll(async ({ request }) => {
    if (b2cId) await request.delete(apiUrl(`/api/clients/b2c/${b2cId}`), auth(token));
    if (b2bId) await request.delete(apiUrl(`/api/clients/b2b/${b2bId}`), auth(token));
  });

  test('create + edit a B2C pilgrim', async ({ request }) => {
    const create = await request.post(apiUrl('/api/clients/b2c'), {
      ...auth(token), data: { fullName: `${tag()} Pilgrim`, gender: 'Male', phone: '03001112222' },
    });
    expect(create.status(), 'create B2C').toBe(201);
    b2cId = (await create.json()).data._id;

    const edit = await request.put(apiUrl(`/api/clients/b2c/${b2cId}`), { ...auth(token), data: { city: 'Lahore' } });
    expect(edit.status(), 'edit B2C').toBe(200);
    expect((await edit.json()).data.city).toBe('Lahore');
  });

  test('search with regex characters is handled safely (200)', async ({ request }) => {
    const res = await request.get(apiUrl(`/api/clients/b2c?search=${encodeURIComponent('.*(')}`), auth(token));
    expect(res.status(), 'regex metacharacters must not crash search').toBe(200);
  });

  test('create a B2B agent with an auto agent code', async ({ request }) => {
    const res = await request.post(apiUrl('/api/clients/b2b'), {
      ...auth(token), data: { companyName: `${tag()} Agency`, contactPerson: 'SQA Contact', phone: '03003334444' },
    });
    expect(res.status(), 'create B2B').toBe(201);
    const data = (await res.json()).data;
    b2bId = data._id;
    expect(data.agentCode, 'agent code should be auto-generated').toBeTruthy();
  });
});
