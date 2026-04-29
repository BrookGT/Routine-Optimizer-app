/**
 * Demo location + copy so list/detail always show map-ready coordinates
 * when the API omits them. Stable per place id.
 */

const DEMO_HUB = { lat: 9.03, lng: 38.748 };
const STREETS = [
    "Bole Rd",
    "Meskel Ave",
    "Kazanchis",
    "Ras Desta",
    "Unity Park Way",
];

function hashString(s) {
    const str = String(s ?? "");
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
}

/**
 * @param {object} place
 * @param {number} index
 * @returns {object} place with latitude, longitude, addressLine, hoursDisplay, areaLabel, mapPreviewUrl
 */
export function enrichPlaceLocation(place, index = 0) {
    const id = String(place?.placeId ?? place?.id ?? place?.name ?? index);
    const h = hashString(id);

    // Support all coordinate shapes:
    //   - place.latitude / place.longitude  (Firestore & normalised)
    //   - place.lat / place.lng             (shorthand)
    //   - place.location.lat / .lng         (Google Places API response shape)
    const rawLat =
        place?.latitude ?? place?.lat ?? place?.location?.lat;
    const rawLng =
        place?.longitude ?? place?.lng ?? place?.location?.lng;
    let lat =
        typeof rawLat === "number"
            ? rawLat
            : typeof rawLat === "string"
              ? parseFloat(rawLat)
              : null;
    let lng =
        typeof rawLng === "number"
            ? rawLng
            : typeof rawLng === "string"
              ? parseFloat(rawLng)
              : null;

    if (
        lat == null ||
        lng == null ||
        Number.isNaN(lat) ||
        Number.isNaN(lng)
    ) {
        const dx = ((h % 200) - 100) / 6000;
        const dy = (((h >> 9) % 200) - 100) / 6000;
        lat = DEMO_HUB.lat + dx;
        lng = DEMO_HUB.lng + dy;
    }

    const street = STREETS[h % STREETS.length];
    const no = 12 + (h % 180);
    const addressLine =
        place?.address ??
        place?.addressLine ??
        place?.vicinity ??
        place?.location?.city ??
        `${no} ${street}, Addis Ababa`;

    const areaLabel =
        place?.areaLabel ??
        place?.neighborhood ??
        (h % 2 === 0 ? "Bole · Uptown" : "Kazanchis · Central");

    const hoursDisplay =
        place?.hoursDisplay ??
        place?.hours ??
        "Mon–Sun · 9:00 — 22:00";

    const priceHint =
        place?.priceRange ??
        place?.priceHint ??
        (h % 3 === 0 ? "$" : h % 3 === 1 ? "$$" : "$$$");

    const mapPreviewUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=640x320&maptype=mapnik&markers=${lat},${lng},lightblue1`;

    return {
        ...place,
        latitude: lat,
        longitude: lng,
        addressLine,
        areaLabel,
        hoursDisplay,
        priceHint,
        mapPreviewUrl,
    };
}
