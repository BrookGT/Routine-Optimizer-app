import { useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../context/ThemeContext";
import AuthenticatedPlacePhoto from "./AuthenticatedPlacePhoto";

/**
 * DiscoverCard — used in the Discover tab.
 *
 * Compact horizontal layout with thumbnail area, place info, AI insight,
 * distance / score row and four action buttons: View · Save · Dismiss.
 *
 * Props:
 *   place      {object}    — normalised place object from recommendationPlaces.js
 *   onPress    {function}  — tapping the card body → open detail
 *   onSave     {function}  — save interaction
 *   onDismiss  {function}  — dismiss interaction
 */
export default function DiscoverCard({ place, onPress, onSave, onDismiss }) {
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(
        () => createStyles(palette, isDark),
        [palette, isDark],
    );

    const [thumbFailed, setThumbFailed] = useState(false);
    const thumbPath = place?.images?.[0] ?? null;
    const showThumb = Boolean(thumbPath) && !thumbFailed;

    useEffect(() => {
        setThumbFailed(false);
    }, [thumbPath]);

    const entrance = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(entrance, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [entrance]);

    const animStyle = {
        opacity: entrance,
        transform: [
            {
                translateY: entrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                }),
            },
        ],
    };

    const typeLabel = place?.type ?? "Place";
    const nameLabel = place?.name ?? "Recommended Place";
    const score = place?.score ?? null;
    const distance = place?.distance ?? "Nearby";
    const aiInsight = place?.aiInsight ?? null;
    const description = place?.description ?? "";

    // Generate a pseudo-color for the thumbnail placeholder based on place type
    const thumbColors = useMemo(() => {
        const typeLower = typeLabel.toLowerCase();
        if (typeLower.includes("gym") || typeLower.includes("fitness")) {
            return isDark
                ? ["#0e2d4f", "#0b3d4a"]
                : ["#c8e6ff", "#b8f0de"];
        }
        if (typeLower.includes("cafe") || typeLower.includes("coffee")) {
            return isDark
                ? ["#2d1e0e", "#3d2910"]
                : ["#ffe8cc", "#fff3e0"];
        }
        if (typeLower.includes("church") || typeLower.includes("worship")) {
            return isDark
                ? ["#1a1a2e", "#16213e"]
                : ["#e8e0ff", "#f0eaff"];
        }
        if (typeLower.includes("event") || typeLower.includes("music")) {
            return isDark
                ? ["#1a0e2d", "#2d1040"]
                : ["#ffe0f0", "#fce8ff"];
        }
        if (typeLower.includes("workspace") || typeLower.includes("office")) {
            return isDark
                ? ["#0d1f0e", "#0e2d14"]
                : ["#e0f5e8", "#d4f7e0"];
        }
        return isDark
            ? ["#0e1f2d", "#0b2a3a"]
            : ["#daf0ff", "#e0f8f2"];
    }, [typeLabel, isDark]);

    const thumbIcon = useMemo(() => {
        const typeLower = typeLabel.toLowerCase();
        if (typeLower.includes("gym") || typeLower.includes("fitness")) return "barbell";
        if (typeLower.includes("cafe") || typeLower.includes("coffee")) return "cafe";
        if (typeLower.includes("church") || typeLower.includes("worship")) return "business";
        if (typeLower.includes("event")) return "musical-notes";
        if (typeLower.includes("workspace") || typeLower.includes("office")) return "briefcase";
        return "location";
    }, [typeLabel]);

    return (
        <Animated.View style={[styles.wrapper, animStyle]}>
            <Pressable onPress={onPress} style={styles.pressable}>
                <LinearGradient
                    colors={gradients.card}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.card}
                >
                    {/* ── Thumbnail ── */}
                    <View style={styles.thumbnail}>
                        {showThumb ? (
                            <AuthenticatedPlacePhoto
                                imagePath={thumbPath}
                                style={StyleSheet.absoluteFillObject}
                                resizeMode="cover"
                                onError={() => setThumbFailed(true)}
                            />
                        ) : null}
                        {!showThumb ? (
                            <LinearGradient
                                colors={thumbColors}
                                style={StyleSheet.absoluteFillObject}
                            >
                                <Ionicons
                                    name={thumbIcon}
                                    size={26}
                                    color={palette.oceanBlue}
                                />
                            </LinearGradient>
                        ) : (
                            <LinearGradient
                                colors={["transparent", "rgba(0,0,0,0.2)"]}
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                            />
                        )}
                        {score ? (
                            <View style={styles.scorePill}>
                                <Text style={styles.scoreText}>{score}</Text>
                            </View>
                        ) : null}
                    </View>

                    {/* ── Info ── */}
                    <View style={styles.info}>
                        {/* Type badge */}
                        <View style={styles.typeBadge}>
                            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
                        </View>

                        {/* Name */}
                        <Text style={styles.name} numberOfLines={1}>
                            {nameLabel}
                        </Text>

                        {/* Description */}
                        {description ? (
                            <Text
                                style={styles.description}
                                numberOfLines={1}
                            >
                                {description}
                            </Text>
                        ) : null}

                        {/* AI insight */}
                        {aiInsight ? (
                            <View style={styles.aiRow}>
                                <Ionicons
                                    name="flash"
                                    size={9}
                                    color={palette.oceanBlue}
                                />
                                <Text
                                    style={styles.aiText}
                                    numberOfLines={1}
                                >
                                    {aiInsight}
                                </Text>
                            </View>
                        ) : null}

                        {/* Footer: distance + actions */}
                        <View style={styles.footer}>
                            <View style={styles.distanceRow}>
                                <Ionicons
                                    name="location-outline"
                                    size={11}
                                    color={palette.textMuted}
                                />
                                <Text style={styles.distanceText}>
                                    {distance}
                                </Text>
                            </View>

                            <View style={styles.actions}>
                                {/* View */}
                                <Pressable
                                    onPress={onPress}
                                    hitSlop={6}
                                    style={styles.actionBtn}
                                >
                                    <Ionicons
                                        name="eye-outline"
                                        size={15}
                                        color={palette.deepBlue}
                                    />
                                </Pressable>

                                {/* Save */}
                                {typeof onSave === "function" ? (
                                    <Pressable
                                        onPress={onSave}
                                        hitSlop={6}
                                        style={styles.actionBtn}
                                    >
                                        <Ionicons
                                            name="heart-outline"
                                            size={15}
                                            color={palette.deepBlue}
                                        />
                                    </Pressable>
                                ) : null}

                                {/* Dismiss */}
                                {typeof onDismiss === "function" ? (
                                    <Pressable
                                        onPress={onDismiss}
                                        hitSlop={6}
                                        style={styles.actionBtn}
                                    >
                                        <Ionicons
                                            name="close"
                                            size={15}
                                            color={palette.textMuted}
                                        />
                                    </Pressable>
                                ) : null}
                            </View>
                        </View>
                    </View>
                </LinearGradient>
            </Pressable>
        </Animated.View>
    );
}

function createStyles(palette, isDark) {
    return StyleSheet.create({
        wrapper: {
            marginBottom: 12,
        },
        pressable: {},
        card: {
            borderRadius: 18,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            flexDirection: "row",
            overflow: "hidden",
            shadowColor: "#2A94D7",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.18 : 0.1,
            shadowRadius: 14,
            elevation: 4,
        },
        thumbnail: {
            width: 80,
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
        },
        scorePill: {
            position: "absolute",
            bottom: 6,
            left: 4,
            right: 4,
            backgroundColor: "rgba(38,201,122,0.22)",
            borderRadius: 8,
            paddingHorizontal: 4,
            paddingVertical: 2,
            alignItems: "center",
        },
        scoreText: {
            color: palette.emerald,
            fontSize: 9,
            fontWeight: "800",
        },
        info: {
            flex: 1,
            padding: 12,
        },
        typeBadge: {
            alignSelf: "flex-start",
            backgroundColor: "rgba(31,159,234,0.12)",
            borderColor: "rgba(15,124,199,0.4)",
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 7,
            paddingVertical: 2,
            marginBottom: 4,
        },
        typeBadgeText: {
            color: palette.deepBlue,
            fontSize: 9,
            fontWeight: "700",
            letterSpacing: 0.3,
        },
        name: {
            color: palette.textPrimary,
            fontSize: 15,
            fontWeight: "800",
            marginBottom: 2,
        },
        description: {
            color: palette.textSecondary,
            fontSize: 11,
            lineHeight: 16,
            marginBottom: 4,
        },
        aiRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: "rgba(15,124,199,0.08)",
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 3,
            alignSelf: "flex-start",
            marginBottom: 6,
        },
        aiText: {
            color: palette.oceanBlue,
            fontSize: 10,
            fontWeight: "600",
        },
        footer: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 2,
        },
        distanceRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
        },
        distanceText: {
            color: palette.textMuted,
            fontSize: 11,
            fontWeight: "600",
        },
        actions: {
            flexDirection: "row",
            gap: 4,
            backgroundColor: isDark
                ? "rgba(22,44,70,0.84)"
                : "rgba(255,255,255,0.84)",
            borderWidth: 1,
            borderColor: palette.borderSoft,
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 4,
        },
        actionBtn: {
            width: 24,
            height: 24,
            alignItems: "center",
            justifyContent: "center",
        },
    });
}
