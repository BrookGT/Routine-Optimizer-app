import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { API_BASE_URL } from "../utils/constants";

/**
 * @param {string|null|undefined} pathOrUrl — `/places/:id/photo?ref=...&w=...` or absolute URL
 * @returns {string|null}
 */
export function toPlacePhotoAbsoluteUri(pathOrUrl) {
    if (!pathOrUrl) return null;
    const s = String(pathOrUrl);
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    const p = s.startsWith("/") ? s : `/${s}`;
    return `${API_BASE_URL}${p}`;
}

/**
 * Shows a place thumbnail or carousel slide.
 * - Internal paths hit GET /api/places/:id/photo (server streams HTTP 200 image bytes).
 * - External URLs (e.g. scraped events) load directly.
 *
 * Props: use either `imagePath` or `relativePath` (call sites historically used both).
 */
export default function AuthenticatedPlacePhoto({
    imagePath,
    relativePath,
    style,
    resizeMode = "cover",
    onLoad,
    onError,
}) {
    const path = imagePath ?? relativePath;
    const uri = toPlacePhotoAbsoluteUri(path);
    const [failed, setFailed] = useState(false);

    if (!path || !uri) {
        return null;
    }

    if (failed) {
        return <View style={[style, styles.fallback]} />;
    }

    return (
        <Image
            source={{ uri }}
            style={style}
            resizeMode={resizeMode}
            onLoad={onLoad}
            onError={() => {
                setFailed(true);
                onError?.();
            }}
        />
    );
}

const styles = StyleSheet.create({
    fallback: { backgroundColor: "rgba(20,40,60,0.22)" },
});
