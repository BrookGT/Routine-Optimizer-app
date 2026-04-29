import * as Location from "expo-location";

/**
 * Query params for GET /api/recommendations so the backend can load Google Places.
 * Returns {} if permission denied or location unavailable — backend then uses Firestore.
 *
 * @param {number} [radiusKm=5]
 * @returns {Promise<{ lat: number, lng: number, radius: number } | {}>}
 */
export async function getLocationQueryParams(radiusKm = 5) {
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return {};

        const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });

        return {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            radius: radiusKm,
        };
    } catch {
        return {};
    }
}
