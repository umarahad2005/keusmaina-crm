// Display names for a package's airline and hotels.
//
// There are two shapes to read from, depending on where the package came from:
//
//   custom  -> components.airline / makkahHotel.hotel are populated refs into
//              our own inventory, so the name lives on the ref.
//   fixed   -> bought whole from a supplier and typed by hand, so the name was
//              snapshotted onto components.airlineName / *.hotelName when the
//              fixed package was sold. The refs are empty.
//
// Every reader should come through here instead of picking one shape, so a
// fixed-package sale never prints a blank flight or hotel.

const text = (v) => (typeof v === 'string' ? v.trim() : '');

// Populated refs arrive as objects; an unpopulated one is just an id string.
const ref = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/** "Saudia SV701" — airline for compact display. Empty string when unknown. */
export function airlineText(components) {
    const a = ref(components?.airline);
    if (a?.name) return [a.name, a.flightNumber].filter(Boolean).join(' ');
    return text(components?.airlineName);
}

/** Adds route and cabin when we hold the inventory record; falls back to the
 *  typed name, which is all a supplier-provided package gives us. */
export function airlineDetailText(components) {
    const a = ref(components?.airline);
    if (a?.name) {
        const route = a.departureCity && a.arrivalCity ? `${a.departureCity} → ${a.arrivalCity}` : '';
        return [
            [a.name, a.flightNumber].filter(Boolean).join(' '),
            route,
            a.seatClass
        ].filter(Boolean).join(' · ');
    }
    return text(components?.airlineName);
}

/** Hotel name for 'makkah' | 'madinah'. Empty string when unknown. */
export function hotelText(components, city) {
    const key = city === 'madinah' ? 'madinahHotel' : 'makkahHotel';
    const slot = components?.[key];
    return text(ref(slot?.hotel)?.name) || text(slot?.hotelName);
}
