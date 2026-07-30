const mongoose = require('mongoose');

// A mini group — a family or small party that travels together, buys one
// package and settles as a single account.
//
// This is a BILLING CONTAINER over existing B2C clients, not a client type of
// its own. Every pilgrim keeps their own profile, passport, visa record and
// place on a manifest; the group only says "these people pay together".
//
// Money still posts to a real client — the `payer` — so every existing ledger,
// invoice, receipt and receivables query keeps working untouched. Entries are
// additionally tagged with the group (LedgerEntry.clientGroup) so the
// receivables screen can show and total the family as one line.

const clientGroupSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'Group name is required'], trim: true },

    // Everyone in the party, including the payer.
    members: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ClientB2C' }],
        validate: [
            {
                // A group of one is just a client — shared settlement is the point.
                validator: (v) => Array.isArray(v) && v.length >= 2,
                message: 'A mini group needs at least 2 members'
            },
            {
                // The same pilgrim twice would double-count the party.
                validator: (v) => new Set((v || []).map(String)).size === (v || []).length,
                message: 'The same member is listed twice'
            }
        ]
    },

    // Whoever the account sits with. Must be one of `members` — money posts to
    // the payer, so a payer outside the group would silently bill someone who
    // isn't in it.
    payer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientB2C',
        required: [true, 'A payer is required — the group settles through one member'],
        validate: {
            validator: function (v) {
                if (!v) return true; // `required` reports this case
                return (this.members || []).some(m => String(m) === String(v));
            },
            message: 'The payer must be one of the group members'
        }
    },

    relation: { type: String, trim: true }, // e.g. "Family", "Friends", "Colleagues"
    notes: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

clientGroupSchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model('ClientGroup', clientGroupSchema);
