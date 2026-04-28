import { Pressable, StyleSheet, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import ProfileSetupScreen from "../screens/ProfileSetupScreen";
import PlaceDetailScreen from "../screens/PlaceDetailScreen";
import ActivityRecommendationsScreen from "../screens/ActivityRecommendationsScreen";
import SplashScreen from "../screens/SplashScreen";
import RoutineBuilderScreen from "../screens/RoutineBuilderScreen";
import MainTabs from "./MainTabs";
import { useAppTheme } from "../context/ThemeContext";

const Stack = createNativeStackNavigator();

/**
 * Legacy users: non-empty `interests` counts as onboarded.
 * New flow: weekly activities, meal prefs, and a numeric weekly budget must be set.
 */
function hasCompletedOnboarding(profile) {
    if (Array.isArray(profile?.interests) && profile.interests.length > 0) {
        return true;
    }
    const wa = profile?.weeklyActivities;
    const mp = profile?.mealPreferences;
    const wb = profile?.weeklyBudget;
    return (
        Array.isArray(wa) &&
        wa.length > 0 &&
        Array.isArray(mp) &&
        mp.length > 0 &&
        typeof wb === "number" &&
        wb > 0
    );
}

/**
 * Shown when the app is authenticated but GET /api/profile failed (network error,
 * server unreachable, etc.). Allows the user to retry or sign out.
 */
function ProfileErrorScreen({
    onRetry,
    onSignOut,
    message,
    palette,
    gradients,
    /** Not named `styles` — Hermes can throw "Property 'styles' doesn't exist". */
    styleSheet,
}) {
    return (
        <View style={styleSheet.container}>
            <View style={styleSheet.iconWrap}>
                <Ionicons
                    name="cloud-offline-outline"
                    size={46}
                    color={palette.oceanBlue}
                />
            </View>
            <Text style={styleSheet.title}>Could not connect</Text>
            <Text style={styleSheet.body}>
                {message ??
                    "We couldn't reach the server. Check your connection and try again."}
            </Text>
            <Pressable style={styleSheet.retryBtnWrap} onPress={onRetry}>
                <LinearGradient
                    colors={gradients.primaryButtonMint}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styleSheet.retryBtn}
                >
                    <Text style={styleSheet.retryText}>Retry</Text>
                </LinearGradient>
            </Pressable>
            <Pressable style={styleSheet.signOutBtn} onPress={onSignOut}>
                <Text style={styleSheet.signOutText}>Sign out</Text>
            </Pressable>
        </View>
    );
}

// ─── Navigator ────────────────────────────────────────────────────────────────

export default function AppNavigator() {
    const { palette, gradients } = useAppTheme();
    const errStyles = useMemo(() => createErrStyles(palette), [palette]);

    const { user, ready, profile, profileError, retryProfileLoad, clearAuth } =
        useAuth();

    // ── 1. Not bootstrapped yet → splash ──────────────────────────────────
    if (!ready) {
        return <SplashScreen />;
    }

    // ── 2. Not signed in → Login ──────────────────────────────────────────
    if (!user) {
        return (
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: palette.pageTop },
                }}
            >
                <Stack.Screen name="Login" component={LoginScreen} />
            </Stack.Navigator>
        );
    }

    // ── 3. Signed in but profile failed to load (network / server error) ──
    if (profileError) {
        return (
            <ProfileErrorScreen
                message={profileError}
                onRetry={retryProfileLoad}
                onSignOut={clearAuth}
                palette={palette}
                gradients={gradients}
                styleSheet={errStyles}
            />
        );
    }

    // ── 4. Signed in + profile loaded → decide which stack to start on ───

    const onboarded = hasCompletedOnboarding(profile);
    const initialRouteName = onboarded ? "MainTabs" : "ProfileSetup";

    return (
        <Stack.Navigator
            /**
             * key = uid so the stack is fully remounted on account switch.
             * Do NOT include onboarding state in the key — it would remount the
             * stack (and skip RoutineBuilder) whenever the profile is saved.
             */
            key={user.uid}
            initialRouteName={initialRouteName}
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: palette.pageTop },
            }}
        >
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
            <Stack.Screen
                name="RoutineBuilder"
                component={RoutineBuilderScreen}
            />
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
            <Stack.Screen
                name="ActivityRecommendations"
                component={ActivityRecommendationsScreen}
            />
            {/* Keep Login in the stack so back-navigation works in edge cases */}
            <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
    );
}

function createErrStyles(palette) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: palette.pageTop,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
        },
        iconWrap: { marginBottom: 20 },
        title: {
            color: palette.textPrimary,
            fontSize: 26,
            fontWeight: "800",
            textAlign: "center",
        },
        body: {
            marginTop: 10,
            color: palette.textSecondary,
            fontSize: 15,
            lineHeight: 22,
            textAlign: "center",
        },
        retryBtnWrap: {
            marginTop: 28,
            width: "100%",
            height: 52,
            borderRadius: 14,
            overflow: "hidden",
        },
        retryBtn: {
            flex: 1,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
        },
        retryText: {
            color: palette.iceWhite,
            fontWeight: "800",
            fontSize: 15,
            textTransform: "uppercase",
            letterSpacing: 0.5,
        },
        signOutBtn: {
            marginTop: 14,
            padding: 10,
        },
        signOutText: {
            color: palette.textMuted,
            fontSize: 13,
        },
    });
}
