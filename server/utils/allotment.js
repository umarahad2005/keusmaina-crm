// Allotment helpers — keep airline soldSeats and hotel rooms-booked in sync
// with confirmed/completed packages.

const Airline = require('../models/Airline');
const HotelMakkah = require('../models/HotelMakkah');
const HotelMadinah = require('../models/HotelMadinah');
const Package = require('../models/Package');

// Statuses where a package is "live" and reserving inventory. quoted/draft are
// not yet committed; cancelled releases the hold.
const CONSUMING_STATUSES = ['confirmed', 'deposit_received', 'fully_paid', 'completed'];

const idStr = (v) => v ? String(v._id || v) : '';

function consumesAirline(pkg) {
    if (!pkg) return null;
    if (!pkg.components?.airline) return null;
    if (!CONSUMING_STATUSES.includes(pkg.status)) return null;
    return {
        airline: idStr(pkg.components.airline),
        seats: Number(pkg.numberOfPilgrims) || 0
    };
}

// Apply the delta (new − old) to airline.soldSeats. Handles airline change too.
async function applyAirlineDelta(oldPkg, newPkg) {
    const oldA = consumesAirline(oldPkg);
    const newA = consumesAirline(newPkg);

    if (!oldA && !newA) return;

    if (oldA && newA && oldA.airline === newA.airline) {
        const diff = newA.seats - oldA.seats;
        if (diff !== 0) await Airline.findByIdAndUpdate(newA.airline, { $inc: { soldSeats: diff } });
        return;
    }
    if (oldA) await Airline.findByIdAndUpdate(oldA.airline, { $inc: { soldSeats: -oldA.seats } });
    if (newA) await Airline.findByIdAndUpdate(newA.airline, { $inc: { soldSeats: newA.seats } });
}

// Validate that confirming/saving newPkg won't push the airline past totalSeats.
// Returns null on OK or { message } on failure. Subtracts oldPkg's contribution
// so editing doesn't double-count.
async function checkAirlineCapacity(oldPkg, newPkg) {
    const newA = consumesAirline(newPkg);
    if (!newA) return null;
    const airline = await Airline.findById(newA.airline);
    if (!airline?.totalSeats) return null;
    const oldA = consumesAirline(oldPkg);
    const oldSeatsForThisAirline = oldA && oldA.airline === newA.airline ? oldA.seats : 0;
    const projected = (airline.soldSeats || 0) - oldSeatsForThisAirline + newA.seats;
    if (projected > airline.totalSeats) {
        const remaining = airline.totalSeats - ((airline.soldSeats || 0) - oldSeatsForThisAirline);
        return { message: `Flight ${airline.name} ${airline.flightNumber || ''} only has ${Math.max(0, remaining)} seat(s) left — cannot book ${newA.seats}.` };
    }
    return null;
}

// ─── HOTEL AVAILABILITY ─────────────────────────────────────

function roomsNeeded(pilgrims, maxOccupancy) {
    const max = Math.max(1, Number(maxOccupancy) || 1);
    return Math.ceil((Number(pilgrims) || 0) / max);
}

function dateRangeOf(comp, departure) {
    if (!comp?.hotel || !departure || !comp.nights) return null;
    const checkIn = new Date(departure);
    if (isNaN(checkIn)) return null;
    const checkOut = new Date(checkIn.getTime() + Number(comp.nights) * 86400000);
    return { checkIn, checkOut };
}

// Sum rooms booked in [from, to] across all confirmed/completed packages
// that use the same hotel, optionally excluding one package id.
async function roomsBookedDuringWindow({ hotelField, hotelId, from, to, excludePackageId, hotelDoc }) {
    if (!hotelId || !from || !to) return 0;
    const query = {
        status: { $in: CONSUMING_STATUSES },
        [`components.${hotelField}.hotel`]: hotelId,
        'travelDates.departure': { $exists: true }
    };
    if (excludePackageId) query._id = { $ne: excludePackageId };

    const candidates = await Package.find(query).select(`numberOfPilgrims travelDates components.${hotelField}`).lean();

    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();

    let total = 0;
    for (const p of candidates) {
        const comp = p.components?.[hotelField];
        const range = dateRangeOf(comp, p.travelDates?.departure);
        if (!range) continue;
        const ovlStart = Math.max(fromMs, range.checkIn.getTime());
        const ovlEnd = Math.min(toMs, range.checkOut.getTime());
        if (ovlEnd <= ovlStart) continue;
        const room = (hotelDoc?.roomTypes || []).find(r => r.typeName === comp.roomType);
        total += roomsNeeded(p.numberOfPilgrims, room?.maxOccupancy);
    }
    return total;
}

async function hotelAvailability({ hotelField, hotelId, from, to, excludePackageId }) {
    const HotelModel = hotelField === 'makkahHotel' ? HotelMakkah : HotelMadinah;
    const hotel = await HotelModel.findById(hotelId).lean();
    if (!hotel) return null;
    const totalRooms = Number(hotel.totalRooms) || 0;
    const roomsBooked = await roomsBookedDuringWindow({ hotelField, hotelId, from, to, excludePackageId, hotelDoc: hotel });
    return {
        hotelName: hotel.name,
        totalRooms,
        roomsBooked,
        roomsAvailable: Math.max(0, totalRooms - roomsBooked)
    };
}

module.exports = {
    CONSUMING_STATUSES,
    consumesAirline,
    applyAirlineDelta,
    checkAirlineCapacity,
    roomsNeeded,
    dateRangeOf,
    hotelAvailability
};
