/**
 * NotificationPermissionScreen.js
 *
 * Beautiful onboarding-style screen explaining why the app needs notifications.
 * Shown once before the OS permission dialog.
 */

import React, { useEffect, useRef } from "react";
import {
    Animated,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import { markPermissionScreenShown } from "../services/notificationService";

const FEATURES = [
    {
        icon: "sunny-outline",
        title: "Morning Briefing",
        description:
            "Start each day with a personalized plan built around your routine and schedule.",
    },
    {
        icon: "restaurant-outline",
        title: "Midday Suggestions",
        description:
            "Discover lunch spots and afternoon activities that match your taste and budget.",
    },
    {
        icon: "moon-outline",
        title: "Evening Recap",
        description:
            "Wind down with tailored evening suggestions and prepare for tomorrow.",
    },
    {
        icon: "sparkles-outline",
        title: "Smart Moments",
        description:
            "Get notified about nearby events, trending places, and meaningful activities at the right time.",
    },
];

export default function NotificationPermissionScreen({ onAllow, onSkip }) {
    const { palette, gradients, isDark } = useAppTheme();
    const styles = createStyles(palette, isDark);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const iconScale = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
        markPermissionScreenShown();

        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 60,
                friction: 10,
                useNativeDriver: true,
            }),
            Animated.spring(iconScale, {
                toValue: 1,
                tension: 80,
                friction: 8,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const featureAnims = FEATURES.map((_, i) =>
        useRef(new Animated.Value(0)).current,
    );

    useEffect(() => {
        FEATURES.forEach((_, i) => {
            Animated.timing(featureAnims[i], {
                toValue: 1,
                duration: 400,
                delay: 300 + i * 120,
                useNativeDriver: true,
            }).start();
        });
    }, []);

    return (
        <SafeAreaView style={styles.safe}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Icon */}
                    <Animated.View
                        style={[
                            styles.iconWrap,
                            { transform: [{ scale: iconScale }], opacity: fadeAnim },
                        ]}
                    >
                        <LinearGradient
                            colors={gradients.primaryButtonMint}
                            style={styles.iconGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Ionicons
                                name="notifications-outline"
                                size={44}
                                color="#fff"
                            />
                        </LinearGradient>
                    </Animated.View>

                    {/* Headline */}
                    <Animated.View
                        style={[
                            styles.headlineWrap,
                            {
                                opacity: fadeAnim,
                                transform: [{ translateY: slideAnim }],
                            },
                        ]}
                    >
                        <Text style={styles.headline}>
                            Your AI daily assistant
                        </Text>
                        <Text style={styles.subheadline}>
                            Allow notifications so your AI assistant can help
                            organize your day, suggest meaningful activities,
                            and remind you about moments that matter — right
                            when they matter.
                        </Text>
                    </Animated.View>

                    {/* Feature list */}
                    <View style={styles.featureList}>
                        {FEATURES.map((feature, i) => (
                            <Animated.View
                                key={feature.title}
                                style={[
                                    styles.featureRow,
                                    {
                                        opacity: featureAnims[i],
                                        transform: [
                                            {
                                                translateX:
                                                    featureAnims[i].interpolate(
                                                        {
                                                            inputRange: [0, 1],
                                                            outputRange: [
                                                                -20, 0,
                                                            ],
                                                        },
                                                    ),
                                            },
                                        ],
                                    },
                                ]}
                            >
                                <View style={styles.featureIconWrap}>
                                    <LinearGradient
                                        colors={
                                            i % 2 === 0
                                                ? gradients.primaryButtonMint
                                                : [
                                                      palette.oceanBlue,
                                                      palette.deepBlue,
                                                  ]
                                        }
                                        style={styles.featureIconGrad}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    >
                                        <Ionicons
                                            name={feature.icon}
                                            size={20}
                                            color="#fff"
                                        />
                                    </LinearGradient>
                                </View>
                                <View style={styles.featureText}>
                                    <Text style={styles.featureTitle}>
                                        {feature.title}
                                    </Text>
                                    <Text style={styles.featureDesc}>
                                        {feature.description}
                                    </Text>
                                </View>
                            </Animated.View>
                        ))}
                    </View>

                    {/* Privacy note */}
                    <Animated.View
                        style={[styles.privacyNote, { opacity: fadeAnim }]}
                    >
                        <Ionicons
                            name="shield-checkmark-outline"
                            size={14}
                            color={palette.textMuted}
                        />
                        <Text style={styles.privacyText}>
                            Notifications are calm, personal, and never spammy.
                            You control everything in Settings.
                        </Text>
                    </Animated.View>
                </ScrollView>

                {/* CTA buttons */}
                <Animated.View
                    style={[styles.ctaWrap, { opacity: fadeAnim }]}
                >
                    <Pressable style={styles.allowBtnWrap} onPress={onAllow}>
                        <LinearGradient
                            colors={gradients.primaryButtonMint}
                            style={styles.allowBtn}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Ionicons
                                name="notifications"
                                size={18}
                                color="#fff"
                                style={{ marginRight: 8 }}
                            />
                            <Text style={styles.allowText}>
                                Allow Notifications
                            </Text>
                        </LinearGradient>
                    </Pressable>

                    <Pressable style={styles.skipBtn} onPress={onSkip}>
                        <Text style={styles.skipText}>
                            Not now — I'll enable later
                        </Text>
                    </Pressable>
                </Animated.View>
            </LinearGradient>
        </SafeAreaView>
    );
}

function createStyles(palette, isDark) {
    return StyleSheet.create({
        safe: { flex: 1, backgroundColor: palette.pageTop },
        gradient: { flex: 1 },
        scroll: {
            paddingTop: 32,
            paddingHorizontal: 28,
            paddingBottom: 20,
        },
        iconWrap: {
            alignSelf: "center",
            marginBottom: 28,
        },
        iconGradient: {
            width: 88,
            height: 88,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: palette.oceanBlue,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 14,
            elevation: 10,
        },
        headlineWrap: {
            marginBottom: 32,
        },
        headline: {
            fontSize: 28,
            fontWeight: "800",
            color: palette.textPrimary,
            textAlign: "center",
            letterSpacing: -0.5,
            marginBottom: 12,
        },
        subheadline: {
            fontSize: 15,
            color: palette.textSecondary,
            textAlign: "center",
            lineHeight: 23,
        },
        featureList: {
            gap: 16,
            marginBottom: 24,
        },
        featureRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            backgroundColor: palette.surface,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: palette.borderSoft,
        },
        featureIconWrap: {
            marginRight: 14,
        },
        featureIconGrad: {
            width: 42,
            height: 42,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
        },
        featureText: {
            flex: 1,
        },
        featureTitle: {
            fontSize: 15,
            fontWeight: "700",
            color: palette.textPrimary,
            marginBottom: 4,
        },
        featureDesc: {
            fontSize: 13,
            color: palette.textSecondary,
            lineHeight: 19,
        },
        privacyNote: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 8,
        },
        privacyText: {
            flex: 1,
            fontSize: 12,
            color: palette.textMuted,
            lineHeight: 17,
        },
        ctaWrap: {
            paddingHorizontal: 28,
            paddingBottom: 16,
            paddingTop: 8,
            gap: 8,
        },
        allowBtnWrap: {
            height: 54,
            borderRadius: 16,
            overflow: "hidden",
        },
        allowBtn: {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
        },
        allowText: {
            color: "#fff",
            fontSize: 16,
            fontWeight: "700",
            letterSpacing: 0.2,
        },
        skipBtn: {
            alignItems: "center",
            paddingVertical: 12,
        },
        skipText: {
            color: palette.textMuted,
            fontSize: 14,
        },
    });
}
