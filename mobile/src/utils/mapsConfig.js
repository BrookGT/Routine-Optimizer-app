import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Whether the native binary was built with a Google Maps SDK key baked into
 * AndroidManifest / Info.plist. Mounting MapView without this on Android throws:
 * java.lang.IllegalStateException: API key not found.
 */
export function hasEmbeddedGoogleMapsSdkKey() {
    const ac = Constants.expoConfig ?? Constants.manifest ?? {};

    // Set in app.config.js when EXPO_PUBLIC_GOOGLE_MAPS_API_KEY was non-empty at build time
    // (same moment native manifest gets com.google.android.geo.API_KEY).
    if (ac.extra?.googleMapsSdkConfigured === true) {
        return true;
    }

    const androidKey = ac.android?.config?.googleMaps?.apiKey;
    const iosKey = ac.ios?.config?.googleMapsApiKey;

    if (Platform.OS === "android") {
        return typeof androidKey === "string" && androidKey.trim().length > 0;
    }
    if (Platform.OS === "ios") {
        return typeof iosKey === "string" && iosKey.trim().length > 0;
    }
    return false;
}
