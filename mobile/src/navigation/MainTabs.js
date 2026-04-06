import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import HomeScreen from "../screens/HomeScreen";
import RoutineScreen from "../screens/RoutineScreen";
import SavedScreen from "../screens/SavedScreen";
import ProfileScreen from "../screens/ProfileScreen";
import { useAppTheme } from "../context/ThemeContext";

const Tab = createBottomTabNavigator();

const iconMap = {
    Home: "home",
    Routines: "calendar-check",
    Saved: "bookmark",
    Profile: "person",
};

function renderTabIcon(routeName, color, size) {
    if (routeName === "Routines") {
        return (
            <MaterialCommunityIcons
                name={iconMap[routeName]}
                color={color}
                size={size}
            />
        );
    }
    return <Ionicons name={iconMap[routeName]} color={color} size={size} />;
}

function FancyTabBar({ state, descriptors, navigation }) {
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(
        () => createStyles(palette, isDark),
        [palette, isDark],
    );
    const [barWidth, setBarWidth] = useState(0);
    const animIndex = useRef(new Animated.Value(state.index)).current;

    useEffect(() => {
        Animated.spring(animIndex, {
            toValue: state.index,
            useNativeDriver: true,
            friction: 8,
            tension: 120,
        }).start();
    }, [animIndex, state.index]);

    const tabCount = state.routes.length;
    const segmentWidth = barWidth > 0 ? barWidth / tabCount : 1;
    const bubbleSize = 54;
    const notchSize = 46;
    const bubbleBaseX = Math.max(0, segmentWidth / 2 - bubbleSize / 2);
    const notchBaseX = Math.max(0, segmentWidth / 2 - notchSize / 2);

    const bubbleTranslateX = Animated.add(
        Animated.multiply(animIndex, segmentWidth),
        bubbleBaseX,
    );
    const notchTranslateX = Animated.add(
        Animated.multiply(animIndex, segmentWidth),
        notchBaseX,
    );

    const activeIcon = state.routes[state.index]?.name;

    return (
        <View style={styles.hostWrap}>
            <View
                style={styles.tabBarWrap}
                onLayout={(event) => {
                    setBarWidth(event.nativeEvent.layout.width);
                }}
            >
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.notch,
                        {
                            backgroundColor: palette.pageBottom,
                            transform: [{ translateX: notchTranslateX }],
                        },
                    ]}
                />

                <View style={styles.tabRow}>
                    {state.routes.map((route, index) => {
                        const isFocused = state.index === index;
                        const onPress = () => {
                            const event = navigation.emit({
                                type: "tabPress",
                                target: route.key,
                                canPreventDefault: true,
                            });

                            if (!isFocused && !event.defaultPrevented) {
                                navigation.navigate(route.name);
                            }
                        };

                        const onLongPress = () => {
                            navigation.emit({
                                type: "tabLongPress",
                                target: route.key,
                            });
                        };

                        const iconLift = animIndex.interpolate({
                            inputRange: [index - 1, index, index + 1],
                            outputRange: [0, -4, 0],
                            extrapolate: "clamp",
                        });

                        const iconScale = animIndex.interpolate({
                            inputRange: [index - 1, index, index + 1],
                            outputRange: [1, 1.1, 1],
                            extrapolate: "clamp",
                        });

                        return (
                            <Pressable
                                key={route.key}
                                accessibilityRole="button"
                                accessibilityState={
                                    isFocused ? { selected: true } : {}
                                }
                                accessibilityLabel={
                                    descriptors[route.key].options
                                        .tabBarAccessibilityLabel
                                }
                                testID={
                                    descriptors[route.key].options
                                        .tabBarButtonTestID
                                }
                                onPress={onPress}
                                onLongPress={onLongPress}
                                style={styles.tabButton}
                            >
                                <Animated.View
                                    style={{
                                        transform: [
                                            { translateY: iconLift },
                                            { scale: iconScale },
                                        ],
                                        opacity: isFocused ? 0 : 1,
                                    }}
                                >
                                    <View style={styles.inactiveIconButton}>
                                        {renderTabIcon(
                                            route.name,
                                            isDark
                                                ? palette.textSecondary
                                                : "#98A0AD",
                                            20,
                                        )}
                                    </View>
                                </Animated.View>
                            </Pressable>
                        );
                    })}
                </View>

                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.activeBubbleWrap,
                        { transform: [{ translateX: bubbleTranslateX }] },
                    ]}
                >
                    <LinearGradient
                        colors={gradients.primaryButtonMint}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.activeBubble}
                    >
                        {renderTabIcon(activeIcon, palette.iceWhite, 22)}
                    </LinearGradient>
                </Animated.View>
            </View>
        </View>
    );
}

export default function MainTabs() {
    return (
        <Tab.Navigator
            tabBar={(props) => <FancyTabBar {...props} />}
            screenOptions={() => ({
                headerShown: false,
                tabBarStyle: { display: "none" },
                tabBarShowLabel: false,
            })}
        >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Routines" component={RoutineScreen} />
            <Tab.Screen name="Saved" component={SavedScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}

function createStyles(palette, isDark) {
    return StyleSheet.create({
        hostWrap: {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 8,
            paddingHorizontal: 18,
        },
        tabBarWrap: {
            height: 72,
            borderRadius: 22,
            backgroundColor: isDark ? "#0A0E16" : "#080C12",
            overflow: "visible",
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.45 : 0.28,
            shadowRadius: 14,
            elevation: 12,
            borderWidth: 1,
            borderColor: isDark
                ? "rgba(116, 176, 255, 0.24)"
                : "rgba(255,255,255,0.08)",
        },
        tabRow: {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 4,
            paddingTop: 10,
        },
        tabButton: {
            flex: 1,
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
        },
        inactiveIconButton: {
            width: 40,
            height: 40,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: isDark
                ? "rgba(130, 182, 255, 0.28)"
                : "rgba(255,255,255,0.1)",
            backgroundColor: isDark
                ? "rgba(21,37,62,0.72)"
                : "rgba(255,255,255,0.06)",
        },
        notch: {
            position: "absolute",
            top: -24,
            width: 46,
            height: 46,
            borderRadius: 23,
        },
        activeBubbleWrap: {
            position: "absolute",
            top: -30,
            width: 54,
            height: 54,
        },
        activeBubble: {
            width: 54,
            height: 54,
            borderRadius: 27,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 3,
            borderColor: isDark ? "#0A0E16" : "#080C12",
            shadowColor: "#2BAFFF",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.35,
            shadowRadius: 12,
            elevation: 12,
        },
    });
}
