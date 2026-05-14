import { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../context/ThemeContext";
import AuthenticatedPlacePhoto from "./AuthenticatedPlacePhoto";
import { effectivePricingEnabled } from "../utils/pricingDisplay";

export default function PlaceCard({ place, onPress, onSave, onDismiss }) {
    const hasActions =
        typeof onSave === "function" || typeof onDismiss === "function";

    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);

    const entrance = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(entrance, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
        }).start();
    }, [entrance]);

    const animatedStyle = {
        opacity: entrance,
        transform: [
            {
                translateY: entrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                }),
            },
        ],
    };

    const showPricing  = effectivePricingEnabled(place);
    const priceTier    = (place?.priceLevel || "").toLowerCase();
    const priceTierMeta = (() => {
        switch (priceTier) {
            case "cheap":     return { label: "Budget",  color: palette.emerald   ?? "#3aa776" };
            case "mid":       return { label: "Mid",     color: palette.oceanBlue ?? "#0a6aa8" };
            case "expensive": return { label: "Premium", color: palette.dangerRed ?? "#c25a4a" };
            default:          return null;
        }
    })();
    const llmReason  = place?.reason || null;
    const overBudget = showPricing && place?.matches?.budget === false;

    // Derive numeric match score from "92% match" string
    const numericScore = useMemo(() => {
        const s = place?.score ?? "";
        const m = String(s).match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }, [place?.score]);

    // Colour-code the match score
    const scoreColor = useMemo(() => {
        if (!numericScore) return palette.emerald;
        if (numericScore >= 85) return "#10B981";   // strong green
        if (numericScore >= 70) return "#3B82F6";   // blue
        return palette.textMuted;
    }, [numericScore, palette]);

    const budgetMatch   = place?.matches?.budget === true || place?.budgetFit === true;
    const religionMatch = place?.matches?.religion === true;

    return (
        <Animated.View style={[styles.wrapper, animatedStyle]}>
            <Pressable onPress={onPress}>
                <LinearGradient
                    colors={gradients.card}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.card}
                >
                    {place?.images?.[0] ? (
                        <View style={styles.cardHero}>
                            <AuthenticatedPlacePhoto
                                relativePath={place.images[0]}
                                style={styles.cardHeroImg}
                            />
                        </View>
                    ) : null}
                    <View style={styles.cardInner}>
                        {/* ── Badge row: type + pricing + match score ── */}
                        <View style={styles.badgesRow}>
                            <View style={styles.badgesRowLeft}>
                                <View style={styles.typeBadge}>
                                    <Text style={styles.typeBadgeText}>
                                        {place?.type ?? "Cafe"}
                                    </Text>
                                </View>
                                {overBudget ? (
                                    <View style={[styles.priceTierBadge, { backgroundColor: "#ff4d4d1E", borderColor: "#ff4d4d55" }]}>
                                        <Ionicons name="alert-circle-outline" size={9} color="#e03030" />
                                        <Text style={[styles.priceTierBadgeText, { color: "#e03030" }]}>
                                            Above budget
                                        </Text>
                                    </View>
                                ) : showPricing && priceTierMeta ? (
                                    <View style={[styles.priceTierBadge, { backgroundColor: priceTierMeta.color + "1F", borderColor: priceTierMeta.color + "55" }]}>
                                        <Text style={[styles.priceTierBadgeText, { color: priceTierMeta.color }]}>
                                            {priceTierMeta.label}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>

                            {/* Score badge — colour-coded by confidence */}
                            <View style={[styles.scoreBadge, { backgroundColor: `${scoreColor}20`, borderColor: `${scoreColor}50` }]}>
                                {numericScore ? (
                                    <Text style={[styles.scoreText, { color: scoreColor }]}>
                                        {numericScore}% match
                                    </Text>
                                ) : (
                                    <Text style={[styles.scoreText, { color: scoreColor }]}>
                                        {place?.score ?? "Top pick"}
                                    </Text>
                                )}
                            </View>
                        </View>

                        <Text style={styles.title}>{place?.name ?? "Place name"}</Text>
                        <Text style={styles.description} numberOfLines={2}>
                            {place?.description ?? "Premium venue with modern atmosphere and strong community vibe."}
                        </Text>

                        {/* ── AI reason / insight ── */}
                        {llmReason ? (
                            <View style={styles.aiInsightRow}>
                                <Ionicons name="sparkles" size={10} color={palette.oceanBlue} />
                                <Text style={styles.aiInsightText} numberOfLines={2}>{llmReason}</Text>
                            </View>
                        ) : place?.aiInsight ? (
                            <View style={styles.aiInsightRow}>
                                <Ionicons name="flash" size={10} color={palette.oceanBlue} />
                                <Text style={styles.aiInsightText} numberOfLines={1}>{place.aiInsight}</Text>
                            </View>
                        ) : null}

                        {/* ── Match criteria chips ── */}
                        {(budgetMatch || religionMatch) && (
                            <View style={styles.matchCriteriaRow}>
                                {budgetMatch && (
                                    <View style={[styles.matchCriteriaChip, { backgroundColor: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.35)" }]}>
                                        <Ionicons name="checkmark-circle" size={10} color="#059669" />
                                        <Text style={[styles.matchCriteriaText, { color: "#059669" }]}>Budget ✓</Text>
                                    </View>
                                )}
                                {religionMatch && (
                                    <View style={[styles.matchCriteriaChip, { backgroundColor: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.35)" }]}>
                                        <Ionicons name="checkmark-circle" size={10} color="#7C3AED" />
                                        <Text style={[styles.matchCriteriaText, { color: "#7C3AED" }]}>Faith ✓</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        <View style={styles.footerRow}>
                            <View style={styles.distanceRow}>
                                <Ionicons name="location-outline" size={12} color={palette.textMuted} />
                                <Text style={styles.distance}>{place?.distance ?? "Nearby"}</Text>
                            </View>
                            {hasActions ? (
                                <View style={styles.actions}>
                                    {typeof onSave === "function" ? (
                                        <Pressable onPress={onSave} hitSlop={8}>
                                            <Ionicons name="heart-outline" size={16} color={palette.deepBlue} />
                                        </Pressable>
                                    ) : null}
                                    {typeof onDismiss === "function" ? (
                                        <Pressable onPress={onDismiss} hitSlop={8}>
                                            <Ionicons name="close" size={16} color={palette.deepBlue} />
                                        </Pressable>
                                    ) : null}
                                </View>
                            ) : null}
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
            marginBottom: 14,
        },
        card: {
            borderRadius: 20,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            padding: 0,
            overflow: "hidden",
            shadowColor: "#2A94D7",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.12,
            shadowRadius: 18,
            elevation: 5,
        },
        cardHero: {
            width: "100%",
            height: 148,
            backgroundColor: "rgba(20,40,60,0.2)",
        },
        cardHeroImg: {
            width: "100%",
            height: "100%",
        },
        cardInner: {
            padding: 16,
        },
        badgesRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },
        badgesRowLeft: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
        },
        priceTierBadge: {
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 3,
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
        },
        priceTierBadgeText: {
            fontSize: 10,
            fontWeight: "800",
            letterSpacing: 0.3,
        },
        typeBadge: {
            backgroundColor: "rgba(31, 159, 234, 0.12)",
            borderColor: "rgba(15, 124, 199, 0.4)",
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 4,
        },
        typeBadgeText: {
            color: palette.deepBlue,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 0.3,
        },
        scoreBadge: {
            borderRadius: 999,
            borderWidth: 1,
            paddingHorizontal: 10,
            paddingVertical: 5,
        },
        scoreText: {
            fontSize: 11,
            fontWeight: "800",
        },
        title: {
            marginTop: 14,
            color: palette.textPrimary,
            fontSize: 22,
            fontWeight: "800",
        },
        description: {
            marginTop: 6,
            color: palette.textSecondary,
            fontSize: 13,
            lineHeight: 19,
        },
        aiInsightRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            marginTop: 8,
            backgroundColor: "rgba(15, 124, 199, 0.08)",
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
            alignSelf: "flex-start",
        },
        aiInsightText: {
            color: palette.oceanBlue,
            fontSize: 11,
            fontWeight: "600",
            flexShrink: 1,
        },
        matchCriteriaRow: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 8,
        },
        matchCriteriaChip: {
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            borderWidth: 1,
        },
        matchCriteriaText: {
            fontSize: 10,
            fontWeight: "700",
        },
        footerRow: {
            marginTop: 14,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },
        distanceRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
        },
        distance: {
            color: palette.textMuted,
            fontSize: 12,
            fontWeight: "600",
        },
        actions: {
            flexDirection: "row",
            gap: 12,
            backgroundColor: palette.surfaceStrong,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 6,
        },
    });
}
