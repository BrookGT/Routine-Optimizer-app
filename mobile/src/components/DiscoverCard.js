import { useEffect, useMemo, useRef } from "react";
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
import { effectivePricingEnabled } from "../utils/pricingDisplay";

/**
 * Discover feed card — like · save · pass. Full actions on detail screen.
 */
export default function DiscoverCard({
    place,
    onPress,
    onPressIn,
    onLike,
    onSave,
    onDismiss,
    liked = false,
    saved = false,
}) {
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(
        () => createStyles(palette, isDark),
        [palette, isDark],
    );

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

    const typeLabel = place?.eventTopic
        ? `${String(place.eventTopic).charAt(0).toUpperCase()}${String(place.eventTopic).slice(1)}`
        : (place?.type ?? "Place");
    const nameLabel    = place?.name ?? "Recommended Place";
    const score        = place?.score ?? null;
    const distance     = place?.distance ?? "Nearby";
    const description  = place?.description ?? "";

    const showPricing = effectivePricingEnabled(place);

    // ── Price ──────────────────────────────────────────────────────────────
    const priceTier = (place?.priceLevel || "").toLowerCase();
    const priceMeta = (() => {
        switch (priceTier) {
            case "cheap":     return { icon: "cash-outline",    label: "Budget",  color: palette.emerald   ?? "#3aa776" };
            case "mid":       return { icon: "card-outline",    label: "Mid",     color: palette.oceanBlue ?? "#0a6aa8" };
            case "expensive": return { icon: "diamond-outline", label: "Premium", color: palette.dangerRed ?? "#c25a4a" };
            default:          return null;
        }
    })();

    // First entry from estimatedCost (e.g. "600–1500 ETB")
    const costText = (() => {
        const ec = place?.estimatedCost;
        if (ec && typeof ec === "object") {
            const first = Object.values(ec)[0];
            if (typeof first === "string") return first;
        }
        return null;
    })();

    // ── AI insight / LLM reason ────────────────────────────────────────────
    const llmReason = place?.reason ?? null;
    const aiInsight = llmReason ?? place?.aiInsight ?? null;

    const thumbPath = place?.images?.[0] ?? null;

    // Generate a pseudo-color for the thumbnail placeholder based on place type
    const thumbColors = useMemo(() => {
        const typeLower = typeLabel.toLowerCase();
        if (typeLower.includes("gym") || typeLower.includes("fitness")) {
            return isDark
                ? ["#0e2d4f", "#0b3d4a"]
                : ["#c8e6ff", "#b8f0de"];
        }
        if (
            typeLower.includes("cafe") ||
            typeLower.includes("coffee") ||
            typeLower.includes("restaurant")
        ) {
            return isDark
                ? ["#2d1e0e", "#3d2910"]
                : ["#ffe8cc", "#fff3e0"];
        }
        if (typeLower.includes("hotel") || typeLower.includes("lodging")) {
            return isDark
                ? ["#1a1528", "#221a38"]
                : ["#ede7ff", "#f5f0ff"];
        }
        if (
            typeLower.includes("sport") ||
            typeLower.includes("stadium") ||
            typeLower.includes("park")
        ) {
            return isDark
                ? ["#0e2d1a", "#0d3d24"]
                : ["#d4f5e0", "#e0f8e8"];
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
        if (
            typeLower.includes("cafe") ||
            typeLower.includes("coffee") ||
            typeLower.includes("restaurant")
        )
            return "cafe";
        if (typeLower.includes("hotel") || typeLower.includes("lodging")) return "bed";
        if (
            typeLower.includes("sport") ||
            typeLower.includes("stadium") ||
            typeLower.includes("park")
        )
            return "football";
        if (typeLower.includes("church") || typeLower.includes("worship")) return "business";
        if (typeLower.includes("event")) return "musical-notes";
        if (typeLower.includes("workspace") || typeLower.includes("office")) return "briefcase";
        return "location";
    }, [typeLabel]);

    return (
        <Animated.View style={[styles.wrapper, animStyle]}>
            <Pressable onPress={onPress} onPressIn={onPressIn} style={styles.pressable}>
                <LinearGradient
                    colors={gradients.card}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.card}
                >
                    {thumbPath ? (
                        <View style={styles.thumbnail}>
                            <AuthenticatedPlacePhoto
                                relativePath={thumbPath}
                                style={styles.thumbnailImage}
                            />
                            {score ? (
                                <View style={styles.scorePill}>
                                    <Text style={styles.scoreText}>{score}</Text>
                                </View>
                            ) : null}
                        </View>
                    ) : (
                        <LinearGradient
                            colors={thumbColors}
                            style={styles.thumbnail}
                        >
                            <Ionicons
                                name={thumbIcon}
                                size={26}
                                color={palette.oceanBlue}
                            />
                            {score ? (
                                <View style={styles.scorePill}>
                                    <Text style={styles.scoreText}>{score}</Text>
                                </View>
                            ) : null}
                        </LinearGradient>
                    )}

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

                        {/* Price tier + cost row */}
                        {showPricing && priceMeta ? (
                            <View style={styles.priceRow}>
                                <View
                                    style={[
                                        styles.pricePill,
                                        {
                                            backgroundColor: priceMeta.color + "1E",
                                            borderColor:    priceMeta.color + "55",
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name={priceMeta.icon}
                                        size={9}
                                        color={priceMeta.color}
                                    />
                                    <Text
                                        style={[styles.priceLabel, { color: priceMeta.color }]}
                                    >
                                        {priceMeta.label}
                                    </Text>
                                </View>
                                {costText ? (
                                    <Text style={[styles.costText, { color: palette.textMuted }]}>
                                        {costText}
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}

                        {/* Match criteria chips */}
                        {(place?.matches?.budget === true || place?.matches?.religion === true || place?.matches?.lifestyle === true) ? (
                            <View style={styles.matchChipsRow}>
                                {place.matches?.budget === true && (
                                    <View style={[styles.matchChip, { backgroundColor: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.4)" }]}>
                                        <Ionicons name="checkmark-circle" size={8} color="#059669" />
                                        <Text style={[styles.matchChipText, { color: "#059669" }]}>Budget</Text>
                                    </View>
                                )}
                                {place.matches?.religion === true && (
                                    <View style={[styles.matchChip, { backgroundColor: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.4)" }]}>
                                        <Ionicons name="checkmark-circle" size={8} color="#7C3AED" />
                                        <Text style={[styles.matchChipText, { color: "#7C3AED" }]}>Faith</Text>
                                    </View>
                                )}
                                {place.matches?.lifestyle === true && (
                                    <View style={[styles.matchChip, { backgroundColor: "rgba(249,115,22,0.1)", borderColor: "rgba(249,115,22,0.4)" }]}>
                                        <Ionicons name="flash" size={8} color="#EA580C" />
                                        <Text style={[styles.matchChipText, { color: "#EA580C" }]}>Lifestyle</Text>
                                    </View>
                                )}
                            </View>
                        ) : null}

                        {/* AI insight / LLM reason */}
                        {aiInsight ? (
                            <View style={styles.aiRow}>
                                <Ionicons
                                    name={llmReason ? "sparkles" : "flash"}
                                    size={9}
                                    color={palette.oceanBlue}
                                />
                                <Text
                                    style={styles.aiText}
                                    numberOfLines={2}
                                >
                                    {aiInsight}
                                </Text>
                            </View>
                        ) : null}

                        {/* Footer: distance + quick actions */}
                        <View style={styles.footer}>
                            <View style={styles.footerLeft}>
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
                            </View>

                            {(typeof onLike === "function" ||
                                typeof onSave === "function" ||
                                typeof onDismiss === "function") && (
                                <View style={styles.feedActions}>
                                    {typeof onLike === "function" ? (
                                        <Pressable
                                            onPress={onLike}
                                            hitSlop={8}
                                            style={[
                                                styles.feedActionBtn,
                                                liked && styles.feedActionBtnLiked,
                                            ]}
                                        >
                                            <Ionicons
                                                name={liked ? "heart" : "heart-outline"}
                                                size={16}
                                                color={liked ? "#EF4444" : palette.textSecondary}
                                            />
                                        </Pressable>
                                    ) : null}
                                    {typeof onSave === "function" ? (
                                        <Pressable
                                            onPress={onSave}
                                            hitSlop={8}
                                            style={[
                                                styles.feedActionBtn,
                                                saved && styles.feedActionBtnSaved,
                                            ]}
                                        >
                                            <Ionicons
                                                name={saved ? "bookmark" : "bookmark-outline"}
                                                size={16}
                                                color={palette.deepBlue}
                                            />
                                        </Pressable>
                                    ) : null}
                                    {typeof onDismiss === "function" ? (
                                        <Pressable
                                            onPress={onDismiss}
                                            hitSlop={8}
                                            style={[
                                                styles.feedActionBtn,
                                                styles.feedActionBtnMuted,
                                            ]}
                                        >
                                            <Ionicons
                                                name="close"
                                                size={15}
                                                color={palette.textMuted}
                                            />
                                        </Pressable>
                                    ) : null}
                                </View>
                            )}
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
            width: 96,
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            backgroundColor: isDark ? "rgba(20,40,60,0.5)" : "rgba(230,240,250,0.9)",
        },
        thumbnailImage: {
            ...StyleSheet.absoluteFillObject,
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
        priceRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
        },
        pricePill: {
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            borderWidth: 1,
            borderRadius: 6,
            paddingHorizontal: 5,
            paddingVertical: 2,
        },
        priceLabel: {
            fontSize: 9,
            fontWeight: "800",
            letterSpacing: 0.2,
        },
        costText: {
            fontSize: 9,
            fontWeight: "600",
        },
        matchChipsRow: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 4,
            marginBottom: 4,
        },
        matchChip: {
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 5,
            paddingVertical: 2,
        },
        matchChipText: {
            fontSize: 8,
            fontWeight: "700",
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
            flexShrink: 1,
        },
        footer: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 6,
        },
        footerLeft: {
            flex: 1,
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
        feedActions: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
        },
        feedActionBtn: {
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDark
                ? "rgba(22,44,70,0.9)"
                : "rgba(255,255,255,0.95)",
            borderWidth: 1,
            borderColor: palette.borderSoft,
        },
        feedActionBtnMuted: {
            opacity: 0.92,
        },
        feedActionBtnLiked: {
            backgroundColor: isDark
                ? "rgba(239,68,68,0.15)"
                : "rgba(254,226,226,0.95)",
            borderColor: "rgba(239,68,68,0.35)",
        },
        feedActionBtnSaved: {
            backgroundColor: isDark
                ? "rgba(15,124,199,0.18)"
                : "rgba(219,242,255,0.95)",
            borderColor: "rgba(15,124,199,0.40)",
        },
    });
}
