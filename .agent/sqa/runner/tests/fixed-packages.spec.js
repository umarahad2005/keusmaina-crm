const { test, expect } = require('@playwright/test');
const { apiUrl, getToken, auth, tag } = require('../fixtures/api');

// Fixed Package inventory: create → 260/290/30 math → sell to N pilgrims →
// client charged 290×N, supplier owed 260×N, profit 30×N. Guards the module.
test.describe('fixed-packages', () => {
    let token, supplierId, clientId, fpId, soldPkgId;

    test.beforeAll(async ({ request }) => {
        token = await getToken(request);
        const sup = await request.post(apiUrl('/api/suppliers'), { ...auth(token), data: { name: `${tag()} Supplier` } });
        expect(sup.status(), 'create supplier').toBe(201);
        supplierId = (await sup.json()).data._id;
        const cli = await request.post(apiUrl('/api/clients/b2c'), { ...auth(token), data: { fullName: `${tag()} Pilgrim`, gender: 'Male', phone: '03000000000' } });
        expect(cli.status(), 'create client').toBe(201);
        clientId = (await cli.json()).data._id;
    });

    test.afterAll(async ({ request }) => {
        if (fpId) await request.delete(apiUrl(`/api/fixed-packages/${fpId}`), auth(token));
        if (soldPkgId) await request.delete(apiUrl(`/api/packages/${soldPkgId}`), auth(token));
        if (clientId) await request.delete(apiUrl(`/api/clients/b2c/${clientId}`), auth(token));
        if (supplierId) await request.delete(apiUrl(`/api/suppliers/${supplierId}`), auth(token));
    });

    test('create computes cost / sell / profit per person', async ({ request }) => {
        const res = await request.post(apiUrl('/api/fixed-packages'), {
            ...auth(token),
            data: { name: `${tag()} Fixed`, supplier: supplierId, basePricePKR: 280000, supplierDiscountPKR: 20000, markupPKR: 10000 },
        });
        expect(res.status(), 'create fixed package').toBe(201);
        const d = (await res.json()).data;
        fpId = d._id;
        expect(d.costPricePKR, 'cost = base − discount').toBe(260000);
        expect(d.sellPricePKR, 'sell = base + markup').toBe(290000);
        expect(d.profitPerPersonPKR, 'profit = markup + discount').toBe(30000);
    });

    test('a closed package cannot be sold', async ({ request }) => {
        const close = await request.patch(apiUrl(`/api/fixed-packages/${fpId}/status`), { ...auth(token), data: { status: 'closed' } });
        expect(close.status()).toBe(200);
        expect((await close.json()).data.status).toBe('closed');

        const sell = await request.post(apiUrl(`/api/fixed-packages/${fpId}/sell`), { ...auth(token), data: { client: clientId, clientType: 'B2C', numberOfPilgrims: 2 } });
        expect(sell.status(), 'selling a closed package must be rejected').toBe(409);

        const reopen = await request.patch(apiUrl(`/api/fixed-packages/${fpId}/status`), { ...auth(token), data: { status: 'active' } });
        expect(reopen.status()).toBe(200);
    });

    test('sell to 4 pilgrims charges 290×4, owes 260×4, profit 30×4', async ({ request }) => {
        const res = await request.post(apiUrl(`/api/fixed-packages/${fpId}/sell`), {
            ...auth(token), data: { client: clientId, clientType: 'B2C', numberOfPilgrims: 4 },
        });
        expect(res.status(), 'sell').toBe(201);
        const d = (await res.json()).data;
        soldPkgId = d.package._id;
        expect(d.totals.totalSellPKR, 'client charged 290k × 4').toBe(1160000);
        expect(d.totals.totalCostPKR, 'supplier owed 260k × 4').toBe(1040000);
        expect(d.totals.totalProfitPKR, 'profit 30k × 4').toBe(120000);
        expect(d.package.source, 'created package is fixed-source').toBe('fixed');
        expect(d.package.pricingSummary.finalPricePKR, 'package sell price in PKR').toBe(1160000);
    });

    test('the created package profit report nets sell − supplier cost', async ({ request }) => {
        const res = await request.get(apiUrl(`/api/packages/${soldPkgId}/profit`), auth(token));
        expect(res.status()).toBe(200);
        const d = (await res.json()).data;
        expect(d.sellPKR, 'fixed PKR sell price, not SAR×rate').toBe(1160000);
        expect(d.totalCostPKR, 'supplier payable recorded on sale').toBe(1040000);
        expect(d.profitPKR, 'profit 120k').toBe(120000);
    });
});
