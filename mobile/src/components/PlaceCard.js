import { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../context/ThemeContext";
import AuthenticatedPlacePhoto from "./AuthenticatedPlacePhoto";

export default function PlaceCard({ place, onPress, onSave, onDismiss }) {
    const hasActions =
        typeof onSave === "function" || typeof onDismiss === "function";

    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

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
                        <View style={styles.badgesRow}>
                            <View style={styles.typeBadge}>
                                <Text style={styles.typeBadgeText}>
                                    {place?.type ?? "Cafe"}
                                </Text>
                            </View>
                            <View style={styles.scoreBadge}>
                                <Text style={styles.scoreText}>
                                    {place?.score ?? "92% match"}
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.title}>
                            {place?.name ?? "Place name"}
                        </Text>
                        <Text style={styles.description} numberOfLines={2}>
                            {place?.description ??
                                "Premium venue with modern atmosphere and strong community vibe."}
                        </Text>

                        {place?.aiInsight ? (
                            <View style={styles.aiInsightRow}>
                                <Ionicons
                                    name="flash"
                                    size={10}
                                    color={palette.oceanBlue}
                                />
                                <Text
                                    style={styles.aiInsightText}
                                    numberOfLines={1}
                                >
                                    {place.aiInsight}
                                </Text>
                            </View>
                        ) : null}

                        <View style={styles.footerRow}>
                            <Text style={styles.distance}>
                                {place?.distance ?? "1.1 miles away"}
                            </Text>
                            {hasActions ? (
                                <View style={styles.actions}>
                                    {typeof onSave === "function" ? (
                                        <Pressable
                                            onPress={onSave}
                                            hitSlop={8}
                                        >
                                            <Ionicons
                                                name="heart-outline"
                                                size={16}
                                                color={palette.deepBlue}
                                            />
                                        </Pressable>
                                    ) : null}
                                    {typeof onDismiss === "function" ? (
                                        <Pressable
                                            onPress={onDismiss}
                                            hitSlop={8}
                                        >
                                            <Ionicons
                                                name="close"
                                                size={16}
                                                color={palette.deepBlue}
                                            />
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

function createStyles(palette) {
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
            backgroundColor: "rgba(38, 201, 122, 0.18)",
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
        },
        scoreText: {
            color: palette.emerald,
            fontSize: 11,
            fontWeight: "700",
        },
        title: {
            marginTop: 14,
            color: palette.textPrimary,
            fontSize: 26,
            fontWeight: "800",
        },
        description: {
            marginTop: 6,
            color: palette.textSecondary,
            fontSize: 13,
            lineHeight: 19,
        },
        footerRow: {
            marginTop: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },
        distance: {
            color: palette.textMuted,
            fontSize: 12,
            fontWeight: "600",
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
