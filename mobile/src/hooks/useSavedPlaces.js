import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { createInteraction, getInteractions } from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { enrichPlaceLocation } from "../utils/placeLocation";

export function asSavedPlace(interaction, index) {
    const place = interaction?.metadata?.place;
    const placeId = interaction?.placeId ?? place?.placeId ?? `${index}`;

    const merged = {
        id: placeId,
        placeId,
        name: place?.name ?? "Saved place",
        type: place?.type ?? "Place",
        score: place?.score ?? "Saved",
        distance: place?.distance ?? "Nearby",
        description:
            place?.description ?? "Saved from your recommendation history.",
        ...place,
    };

    return enrichPlaceLocation(merged, index);
}

/**
 * Loads SAVE interactions from the API (same persistence as the former Saved tab).
 */
export function useSavedPlaces() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadSaved = useCallback(async (opts = {}) => {
        const silent = opts.silent === true;
        try {
            if (!silent) {
                setLoading(true);
            }
            setError("");

            const envelope = await getInteractions();
            const interactions = unwrapApiData(envelope, []);
            const ordered = Array.isArray(interactions) ? interactions : [];
            const savedByPlace = new Map();

            ordered.forEach((interaction, index) => {
                const pid = interaction?.placeId;
                if (!pid) {
                    return;
                }

                if (interaction?.actionType === INTERACTION_TYPES.SAVE) {
                    savedByPlace.set(pid, asSavedPlace(interaction, index));
                }

                if (interaction?.actionType === INTERACTION_TYPES.DISMISS) {
                    savedByPlace.delete(pid);
                }
            });

            setSaved(Array.from(savedByPlace.values()));
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to load saved places."));
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    }, []);

    const handleRefresh = useCallback(async () => {
        try {
            setRefreshing(true);
            await loadSaved({ silent: true });
        } finally {
            setRefreshing(false);
        }
    }, [loadSaved]);

    const handleDismiss = useCallback(async (place, opts = {}) => {
        const source = opts.source ?? "profile_saved_places";
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.DISMISS,
                metadata: {
                    source,
                    place,
                },
            });
            setSaved((current) =>
                current.filter((item) => item.placeId !== place.placeId),
            );
        } catch (err) {
            Alert.alert("Unable to remove", getApiErrorMessage(err));
        }
    }, []);

    return {
        loading,
        error,
        saved,
        refreshing,
        loadSaved,
        handleRefresh,
        handleDismiss,
    };
}
