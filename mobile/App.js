import * as WebBrowser from "expo-web-browser";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useAppTheme } from "./src/context/ThemeContext";
import { NotificationProvider } from "./src/context/NotificationContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { THEMES } from "./src/theme/theme";

WebBrowser.maybeCompleteAuthSession();

// ─── Deep linking configuration ───────────────────────────────────────────────
// Maps wuloye:// URLs to React Navigation screens.
// All notification taps use these paths so the correct screen opens regardless
// of whether the app was in foreground, background, or completely closed.

const linking = {
    prefixes: ["wuloye://"],
    config: {
        screens: {
            MainTabs: {
                screens: {
                    Home: "home",
                    Discover: {
                        path: "discover",
                    },
                    YourSchedule: "schedule",
                    Events: "events",
                    Profile: "profile",
                },
            },
            PlaceDetail: {
                path: "place/:placeId",
            },
            EventDetail: {
                path: "event/:eventId",
            },
            ActivityRecommendations: {
                path: "recommendations",
            },
            SavedPlaces: "saved",
            Trending: "trending",
            NotificationSettings: "notification-settings",
        },
    },
};

// ─── Inner app (inside NavigationContainer so useNavigation works) ────────────

function InnerApp() {
    const { profile } = useAuth();

    return (
        // NotificationProvider must live INSIDE NavigationContainer so that
        // its NavConsumer child can call useNavigation() without crashing.
        <NotificationProvider profile={profile}>
            <AppNavigator />
        </NotificationProvider>
    );
}

// ─── App content ──────────────────────────────────────────────────────────────

function AppContent() {
    const { navigationTheme, mode } = useAppTheme();

    const mergedTheme = {
        ...DefaultTheme,
        ...navigationTheme,
        colors: {
            ...DefaultTheme.colors,
            ...navigationTheme.colors,
        },
    };

    return (
        <NavigationContainer theme={mergedTheme} linking={linking}>
            <StatusBar style={mode === THEMES.DARK ? "light" : "dark"} />
            <InnerApp />
        </NavigationContainer>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </ThemeProvider>
    );
}
