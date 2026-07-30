const express = require('express');
const ClientGroup = require('../models/ClientGroup');
const ClientB2C = require('../models/ClientB2C');
const LedgerEntry = require('../models/LedgerEntry');
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { CLIENTS } = require('../middleware/roles');
const { qStr, safeSearchRegex, stripFields, PROTECTED_FIELDS } = require('../utils/sanitize');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('ClientGroup'));

const GROUP_PROTECTED = [...PROTECTED_FIELDS, 'isActive'];

// Outstanding per group, from the entries tagged with it. Same convention as
// the client ledger: a debit is a charge, a credit is a payment received.
async function balancesByGroup(groupIds) {
    const rows = await LedgerEntry.aggregate([
        { $match: { isActive: true, clientGroup: { $in: groupIds } } },
        {
            $group: {
                _id: '$clientGroup',
                totalDebitPKR: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                totalCreditPKR: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                entryCount: { $sum: 1 }
            }
        }
    ]);
    return new Map(rows.map(r => [String(r._id), {
        totalDebitPKR: Math.round(r.totalDebitPKR),
        totalCreditPKR: Math.round(r.totalCreditPKR),
        balancePKR: Math.round(r.totalDebitPKR - r.totalCreditPKR),
        entryCount: r.entryCount
    }]));
}

const ZERO = { totalDebitPKR: 0, totalCreditPKR: 0, balancePKR: 0, entryCount: 0 };

// GET /api/client-groups — list with balances
router.get('/', async (req, res) => {
    try {
        const q = { isActive: true };
        const search = qStr(req.query.search);
        if (search) q.name = safeSearchRegex(search);

        const groups = await ClientGroup.find(q)
            .sort('-createdAt')
            .populate('members', 'fullName cnic phone passportNumber')
            .populate('payer', 'fullName phone')
            .lean();

        const balances = await balancesByGroup(groups.map(g => g._id));
        const data = groups.map(g => ({ ...g, ...(balances.get(String(g._id)) || ZERO) }));

        const summary = data.reduce((acc, g) => ({
            count: acc.count + 1,
            totalDebitPKR: acc.totalDebitPKR + g.totalDebitPKR,
            totalCreditPKR: acc.totalCreditPKR + g.totalCreditPKR,
            balancePKR: acc.balancePKR + g.balancePKR
        }), { count: 0, totalDebitPKR: 0, totalCreditPKR: 0, balancePKR: 0 });

        res.json({ success: true, data, summary, count: data.length });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/client-groups/:id — group with its entries
router.get('/:id', async (req, res) => {
    try {
        const group = await ClientGroup.findById(req.params.id)
            .populate('members', 'fullName cnic phone passportNumber passportExpiry')
            .populate('payer', 'fullName phone');
        if (!group || group.isActive === false) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }
        const entries = await LedgerEntry.find({ isActive: true, clientGroup: group._id })
            .sort('date')
            .populate('package', 'voucherId packageName')
            .lean();

        // Running balance, oldest first, then hand back newest first for the UI.
        let running = 0;
        const withRunning = entries.map(e => {
            running += (e.amountPKR ?? e.amount) * (e.type === 'debit' ? 1 : -1);
            return { ...e, runningBalancePKR: Math.round(running) };
        }).reverse();

        const balances = await balancesByGroup([group._id]);
        res.json({
            success: true,
            data: { group, entries: withRunning, summary: balances.get(String(group._id)) || ZERO }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/client-groups
router.post('/', authorize(...CLIENTS), async (req, res) => {
    try {
        stripFields(req.body, GROUP_PROTECTED);
        const members = Array.isArray(req.body.members) ? req.body.members : [];

        // Every member must be a real, active pilgrim — otherwise the group
        // would carry dangling references that break the manifest later.
        const found = await ClientB2C.countDocuments({ _id: { $in: members }, isActive: true });
        if (found !== members.length) {
            return res.status(400).json({ success: false, message: 'One or more members do not exist' });
        }

        req.body.createdBy = req.user._id;
        const group = await ClientGroup.create(req.body);
        res.status(201).json({ success: true, data: group });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PUT /api/client-groups/:id
router.put('/:id', authorize(...CLIENTS), async (req, res) => {
    try {
        stripFields(req.body, GROUP_PROTECTED);
        req.body.updatedBy = req.user._id;

        const group = await ClientGroup.findById(req.params.id);
        if (!group || group.isActive === false) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }
        Object.assign(group, req.body);
        await group.save(); // save(), not findByIdAndUpdate — the payer/member
                            // invariants live in a pre-validate hook
        res.json({ success: true, data: group });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/client-groups/:id — soft delete, refused while money is open
router.delete('/:id', authorize(...CLIENTS), async (req, res) => {
    try {
        const group = await ClientGroup.findById(req.params.id);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

        const balances = await balancesByGroup([group._id]);
        const bal = balances.get(String(group._id));
        if (bal && bal.balancePKR !== 0) {
            return res.status(409).json({
                success: false,
                message: `This group still has an outstanding balance of PKR ${bal.balancePKR}. Settle it before removing the group.`
            });
        }
        group.isActive = false;
        group.updatedBy = req.user._id;
        await group.save();
        res.json({ success: true, message: 'Group removed' });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

module.exports = router;
