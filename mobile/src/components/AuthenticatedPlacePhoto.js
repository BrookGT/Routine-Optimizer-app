import { useEffect, useState } from "react";
import { Image } from "react-native";
import { auth } from "../config/firebase";
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
 * Loads a place photo through the authenticated GET /places/:id/photo endpoint
 * (302 → Google CDN). React Native Image supports Authorization headers here.
 */
export default function AuthenticatedPlacePhoto({
    imagePath,
    style,
    resizeMode = "cover",
    onLoad,
    onError,
}) {
    const [source, setSource] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const uri = toPlacePhotoAbsoluteUri(imagePath);
            if (!uri) {
                setSource(null);
                return;
            }
            try {
                const user = auth.currentUser;
                const token = user ? await user.getIdToken() : "";
                if (cancelled) return;
                setSource(
                    token
                        ? { uri, headers: { Authorization: `Bearer ${token}` } }
                        : { uri },
                );
            } catch {
                if (!cancelled) {
                    setSource({ uri: toPlacePhotoAbsoluteUri(imagePath) });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [imagePath]);

    if (!imagePath || !source) return null;

    return (
        <Image
            source={source}
            style={style}
            resizeMode={resizeMode}
            onLoad={onLoad}
            onError={onError}
        />
    );
}
