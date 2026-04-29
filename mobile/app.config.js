/**
 * Dynamic Expo config — merges into app.json.
 *
 * CRITICAL for react-native-maps on Android: the Maps SDK reads
 * com.google.android.geo.API_KEY from the manifest at native build time.
 * That value comes from android.config.googleMaps.apiKey below.
 *
 * Loads mobile/.env so EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is available when you run
 * `expo prebuild` / `expo run:android` locally.
 *
 * EAS cloud builds do NOT upload .env — add the same variable as an EAS Secret:
 *   npx eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value YOUR_KEY --scope project
 * Or set it under Project → Environment variables in expo.dev (Plain text / Sensitive).
 */

const path = require("path");

try {
    require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch {
    /* dotenv optional */
}

const googleMapsApiKey =
    String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
    String(process.env.GOOGLE_MAPS_NATIVE_API_KEY || "").trim();

module.exports = ({ config }) => ({
    ...config,
    extra: {
        ...config.extra,
        /** Set at build time alongside manifest — safe boolean, no key string in JS. */
        googleMapsSdkConfigured: googleMapsApiKey.length > 0,
    },
    ios: {
        ...config.ios,
        config: {
            ...config.ios?.config,
            googleMapsApiKey,
        },
    },
    android: {
        ...config.android,
        config: {
            ...config.android?.config,
            googleMaps: {
                apiKey: googleMapsApiKey,
            },
        },
    },
});
