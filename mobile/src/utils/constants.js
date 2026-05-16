import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Resolves backend base URL for dev:
 * - `EXPO_PUBLIC_API_BASE_URL` wins if set.
 * - In Expo Go / dev, use the same LAN host as Metro (`expoConfig.hostUri`) so a **physical device**
 *   can reach your PC; `10.0.2.2` only works on **Android emulator**.
 */
function resolveApiBaseUrl() {
    const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (fromEnv != null && String(fromEnv).trim() !== "") {
        return String(fromEnv).replace(/\/$/, "");
    }

    const hostUri =
        Constants.expoConfig?.hostUri ??
        Constants.expoGoConfig?.debuggerHost ??
        null;

    if (
        typeof __DEV__ !== "undefined" &&
        __DEV__ &&
        typeof hostUri === "string" &&
        hostUri.length > 0
    ) {
        const host = hostUri.split(":")[0];
        if (host && host !== "127.0.0.1" && host !== "localhost") {
            return `http://${host}:5000/api`;
        }
    }

    if (Platform.OS === "android") {
        return "http://10.0.2.2:5000/api";
    }

    return "http://localhost:5000/api";
}

export const API_BASE_URL = resolveApiBaseUrl();

if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(`[Wuloye] API_BASE_URL = ${API_BASE_URL}`);
}

/** Firebase client config (same project as backend Admin SDK). */
export const FIREBASE_CONFIG = {
    apiKey:
        process.env.EXPO_PUBLIC_FIREBASE_API_KEY ??
        "AIzaSyDpunmqWK_uazdNOOOOr_EtEHv7cCIiVpE",
    authDomain:
        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "wuloye.firebaseapp.com",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "wuloye",
};

/**
 * Web OAuth client ID from Firebase Console → Project settings → Your apps,
 * or Google Cloud → APIs → Credentials (Web client). Required for Google Sign-In + Firebase.
 */
export const GOOGLE_WEB_CLIENT_ID =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

export const INTERACTION_TYPES = {
    VIEW: "view",
    CLICK: "click",
    SAVE: "save",
    DISMISS: "dismiss",
};
