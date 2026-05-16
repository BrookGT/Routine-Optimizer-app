import { useCallback } from "react";
import { Alert, Linking, Share } from "react-native";
import { createInteraction } from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { getApiErrorMessage } from "../utils/api";

/**
 * Shared interaction handlers for places (detail screen + optional feed).
 */
export function usePlaceInteractions(place, options = {}) {
    const {
        source = "place_detail",
        onAfterPositive,
        onAfterNegative,
    } = options;

    const placeId = place?.placeId ?? place?.id;

    const log = useCallback(
        async (actionType, metadata = {}) => {
            if (!placeId) return;
            await createInteraction({
                placeId,
                actionType,
                metadata: { source, ...metadata },
            });
        },
        [placeId, source],
    );

    const logSilent = useCallback(
        (actionType, metadata = {}) => {
            log(actionType, metadata).catch(() => null);
        },
        [log],
    );

    const openDirections = useCallback(async () => {
        const lat = place?.latitude ?? place?.location?.lat;
        const lng = place?.longitude ?? place?.location?.lng;
        const name = encodeURIComponent(place?.name ?? "");
        const url =
            lat != null && lng != null
                ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
                : `https://www.google.com/maps/search/?api=1&query=${name}`;

        await Linking.openURL(url);
        logSilent(INTERACTION_TYPES.DIRECTIONS);
    }, [place, logSilent]);

    const handleLike = useCallback(async () => {
        try {
            await log(INTERACTION_TYPES.LIKE);
            onAfterPositive?.();
        } catch (err) {
            Alert.alert("Could not save feedback", getApiErrorMessage(err));
        }
    }, [log, onAfterPositive]);

    const handleDislike = useCallback(async () => {
        try {
            await log(INTERACTION_TYPES.DISLIKE);
            onAfterNegative?.();
        } catch (err) {
            Alert.alert("Could not save feedback", getApiErrorMessage(err));
        }
    }, [log, onAfterNegative]);

    const handleShare = useCallback(async () => {
        try {
            await Share.share({
                title: place?.name ?? "Check this out",
                message: `${place?.name ?? "A place for you"} — ${place?.description ?? ""} (via Wuloye)`,
            });
            logSilent(INTERACTION_TYPES.SHARE);
        } catch {
            // user cancelled share
        }
    }, [place, logSilent]);

    const handleDirections = useCallback(async () => {
        try {
            await openDirections();
        } catch {
            Alert.alert("Could not open maps", "Please try again.");
        }
    }, [openDirections]);

    const handleNotInterested = useCallback(async () => {
        try {
            await log(INTERACTION_TYPES.NOT_INTERESTED);
            onAfterNegative?.();
        } catch (err) {
            Alert.alert("Action failed", getApiErrorMessage(err));
        }
    }, [log, onAfterNegative]);

    const handleSave = useCallback(
        async (currentlySaved) => {
            try {
                await log(
                    currentlySaved
                        ? INTERACTION_TYPES.REMOVE_SAVE
                        : INTERACTION_TYPES.SAVE,
                );
                return !currentlySaved;
            } catch (err) {
                Alert.alert("Unable to save", getApiErrorMessage(err));
                return currentlySaved;
            }
        },
        [log],
    );

    const handleDismiss = useCallback(async () => {
        try {
            await log(INTERACTION_TYPES.DISMISS);
            onAfterNegative?.();
        } catch (err) {
            Alert.alert("Action failed", getApiErrorMessage(err));
        }
    }, [log, onAfterNegative]);

    const handleOpenDetail = useCallback(() => {
        logSilent(INTERACTION_TYPES.CLICK);
    }, [logSilent]);

    return {
        handleLike,
        handleDislike,
        handleShare,
        handleDirections,
        handleNotInterested,
        handleSave,
        handleDismiss,
        handleOpenDetail,
        logSilent,
    };
}
