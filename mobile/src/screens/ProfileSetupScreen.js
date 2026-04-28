import { useEffect, useMemo, useState } from "react";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import Loader from "../components/Loader";
import { getProfile, updateProfile } from "../api/profileApi";
import { useAuth } from "../context/AuthContext";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

const STEPS = 3;

const WEEKLY_ACTIVITIES = [
    "gym",
    "work",
    "study",
    "family",
    "commute",
    "errands",
    "social",
    "rest",
    "creative",
];

/** Ordered top → bottom; last item is weekend planning signal for recommendations. */
const MEAL_PREFS = [
    "home_cooking",
    "meal_prep",
    "takeout",
    "cafes",
    "quick_bites",
    "vegetarian",
    "high_protein",
    "comfort_food",
    "weekend_goals",
];

const LOCATION_PREF = ["indoor", "outdoor", "any"];

const BUDGET_TIER_LOW = { min: 1, max: 1000 };
const BUDGET_TIER_MEDIUM = { min: 1000, max: 10000 };
const BUDGET_STEP = 10;

function formatLabel(value) {
    if (!value || typeof value !== "string") {
        return "";
    }
    if (value.includes("_")) {
        return value
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function timeFromHHmm(str) {
    const d = new Date();
    d.setSeconds(0, 0);
    if (!str || typeof str !== "string" || !str.includes(":")) {
        d.setHours(23, 0, 0, 0);
        return d;
    }
    const [h, m] = str.split(":").map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) {
        d.setHours(23, 0, 0, 0);
        return d;
    }
    d.setHours(h, m, 0, 0);
    return d;
}

function toHHmm(date) {
    const h = date.getHours();
    const m = date.getMinutes();
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeTimeInput(raw) {
    const s = String(raw ?? "").trim();
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {
        return null;
    }
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh > 23 || mm > 59) {
        return null;
    }
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function deriveBudgetRange(amount) {
    if (amount <= 1500) {
        return "low";
    }
    if (amount <= 6500) {
        return "medium";
    }
    return "high";
}

function inferBudgetTierFromAmount(amount) {
    if (typeof amount !== "number" || Number.isNaN(amount)) {
        return "low";
    }
    if (amount <= BUDGET_TIER_LOW.max) {
        return "low";
    }
    if (amount <= BUDGET_TIER_MEDIUM.max) {
        return "medium";
    }
    return "flexible";
}

function mealPrefLabel(id) {
    if (id === "weekend_goals") {
        return "Weekend goals";
    }
    return formatLabel(id);
}

function mealPrefSubtitle(id) {
    if (id === "weekend_goals") {
        return "Helps tailor weekend events & light tasks for you";
    }
    return null;
}

function SelectChip({ label, selected, onPress, styleSheet }) {
    return (
        <Pressable
            onPress={onPress}
            style={[
                styleSheet.chip,
                selected && styleSheet.chipSelected,
            ]}
        >
            <Text
                style={[
                    styleSheet.chipText,
                    selected && styleSheet.chipTextSelected,
                ]}
            >
                {label}
            </Text>
        </Pressable>
    );
}

export default function ProfileSetupScreen({ navigation }) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    const { refreshProfile } = useAuth();

    const [step, setStep] = useState(0);
    const [sleepTime, setSleepTime] = useState("23:00");
    const [wakeTime, setWakeTime] = useState("07:00");
    const [sleepPickerOpen, setSleepPickerOpen] = useState(false);
    const [wakePickerOpen, setWakePickerOpen] = useState(false);
    const [sleepDate, setSleepDate] = useState(() => timeFromHHmm("23:00"));
    const [wakeDate, setWakeDate] = useState(() => timeFromHHmm("07:00"));

    const [weeklyActivities, setWeeklyActivities] = useState([]);
    const [mealPreferences, setMealPreferences] = useState([]);
    const [budgetTier, setBudgetTier] = useState("low");
    const [weeklyBudget, setWeeklyBudget] = useState(200);
    const [flexibleBudgetText, setFlexibleBudgetText] = useState("200");
    const [locationPreference, setLocationPreference] = useState("any");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;

        async function loadProfile() {
            try {
                setLoading(true);
                setError("");
                const envelope = await getProfile();
                const profile = unwrapApiData(envelope, {});

                if (!mounted) {
                    return;
                }

                if (profile?.sleepTime) {
                    setSleepTime(profile.sleepTime);
                    setSleepDate(timeFromHHmm(profile.sleepTime));
                }
                if (profile?.wakeTime) {
                    setWakeTime(profile.wakeTime);
                    setWakeDate(timeFromHHmm(profile.wakeTime));
                }
                if (
                    Array.isArray(profile?.weeklyActivities) &&
                    profile.weeklyActivities.length > 0
                ) {
                    setWeeklyActivities(profile.weeklyActivities);
                } else if (
                    Array.isArray(profile?.interests) &&
                    profile.interests.length > 0
                ) {
                    setWeeklyActivities(
                        profile.interests.filter((x) =>
                            WEEKLY_ACTIVITIES.includes(x),
                        ),
                    );
                }
                if (
                    Array.isArray(profile?.mealPreferences) &&
                    profile.mealPreferences.length > 0
                ) {
                    setMealPreferences(profile.mealPreferences);
                }
                if (typeof profile?.weeklyBudget === "number") {
                    const amt = profile.weeklyBudget;
                    setWeeklyBudget(amt);
                    setFlexibleBudgetText(String(Math.round(amt)));
                    setBudgetTier(inferBudgetTierFromAmount(amt));
                }
                if (profile?.locationPreference) {
                    setLocationPreference(profile.locationPreference);
                }
            } catch (err) {
                if (mounted) {
                    setError(
                        getApiErrorMessage(err, "Unable to load profile."),
                    );
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        }

        loadProfile();

        return () => {
            mounted = false;
        };
    }, []);

    const stepValid = useMemo(() => {
        if (step === 0) {
            return (
                !!normalizeTimeInput(sleepTime) &&
                !!normalizeTimeInput(wakeTime)
            );
        }
        if (step === 1) {
            return weeklyActivities.length > 0;
        }
        const budgetOk =
            budgetTier === "flexible"
                ? (() => {
                      const n = parseFloat(
                          String(flexibleBudgetText).replace(/,/g, ""),
                      );
                      return Number.isFinite(n) && n >= 1;
                  })()
                : typeof weeklyBudget === "number" &&
                  weeklyBudget >= 1;
        return (
            mealPreferences.length > 0 &&
            budgetOk &&
            !!locationPreference
        );
    }, [
        step,
        sleepTime,
        wakeTime,
        weeklyActivities,
        mealPreferences,
        weeklyBudget,
        budgetTier,
        flexibleBudgetText,
        locationPreference,
    ]);

    const canGoNext = stepValid && !loading;
    const isLastStep = step === STEPS - 1;

    function toggleListItem(item, setList) {
        setList((current) => {
            if (current.includes(item)) {
                return current.filter((x) => x !== item);
            }
            return [...current, item];
        });
    }

    function onSleepChange(_event, date) {
        if (Platform.OS === "android") {
            setSleepPickerOpen(false);
        }
        if (date) {
            setSleepDate(date);
            setSleepTime(toHHmm(date));
        }
    }

    function onWakeChange(_event, date) {
        if (Platform.OS === "android") {
            setWakePickerOpen(false);
        }
        if (date) {
            setWakeDate(date);
            setWakeTime(toHHmm(date));
        }
    }

    function applyBudgetTier(tier) {
        setBudgetTier(tier);
        if (tier === "low") {
            setWeeklyBudget((v) =>
                Math.min(
                    BUDGET_TIER_LOW.max,
                    Math.max(BUDGET_TIER_LOW.min, v ?? 200),
                ),
            );
        } else if (tier === "medium") {
            setWeeklyBudget((v) => {
                const x = v ?? 2500;
                const clamped = Math.min(
                    BUDGET_TIER_MEDIUM.max,
                    Math.max(BUDGET_TIER_MEDIUM.min, x),
                );
                return x < BUDGET_TIER_MEDIUM.min ? 2500 : clamped;
            });
        } else {
            setFlexibleBudgetText(
                String(Math.round(weeklyBudget || 500)),
            );
        }
    }

    function goNext() {
        if (!canGoNext || saving) {
            return;
        }
        setError("");
        if (step < STEPS - 1) {
            setStep((s) => s + 1);
        }
    }

    function goBack() {
        setError("");
        if (step > 0) {
            setStep((s) => s - 1);
        }
    }

    async function saveAndContinue() {
        if (!stepValid || saving) {
            return;
        }

        try {
            setSaving(true);
            setError("");
            let amount =
                budgetTier === "flexible"
                    ? Math.round(
                          parseFloat(
                              String(flexibleBudgetText).replace(/,/g, ""),
                          ) || 0,
                      )
                    : Math.round(weeklyBudget);
            if (!Number.isFinite(amount) || amount < 1) {
                amount = 1;
            }
            const budgetRange = deriveBudgetRange(amount);
            const sleepOut =
                normalizeTimeInput(sleepTime) ?? toHHmm(sleepDate);
            const wakeOut =
                normalizeTimeInput(wakeTime) ?? toHHmm(wakeDate);
            await updateProfile({
                sleepTime: sleepOut,
                wakeTime: wakeOut,
                weeklyActivities,
                mealPreferences,
                weeklyBudget: amount,
                budgetRange,
                locationPreference,
                interests: weeklyActivities,
            });
            await refreshProfile();
            navigation.navigate("RoutineBuilder");
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to save profile."));
        } finally {
            setSaving(false);
        }
    }

    const progressWidth = `${((step + 1) / STEPS) * 100}%`;

    const stepTitle = [
        "Sleep & wake",
        "Your typical week",
        "Food & budget",
    ][step];

    const stepHint = [
        "We use this to respect your energy and timing.",
        "Pick everything that regularly shapes your week.",
        "Meals and spend help recommendations feel realistic.",
    ][step];

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.step}>Step 1 of 2 · Profile</Text>
                    <View style={styles.progressTrack}>
                        <View
                            style={[styles.progressFill, { width: progressWidth }]}
                        />
                    </View>
                    <Text style={styles.stepCounter}>
                        {step + 1} / {STEPS} — {stepTitle}
                    </Text>

                    <Text style={styles.title}>Tell us about you</Text>
                    <Text style={styles.subtitle}>{stepHint}</Text>

                    {loading ? <Loader /> : null}
                    {error ? (
                        <Text style={styles.errorText}>{error}</Text>
                    ) : null}

                    {step === 0 ? (
                        <View style={styles.stepBody}>
                            <Text style={styles.section}>Bedtime</Text>
                            {Platform.OS === "web" ? (
                                <TextInput
                                    value={sleepTime}
                                    onChangeText={setSleepTime}
                                    placeholder="23:00"
                                    keyboardType="numbers-and-punctuation"
                                    style={styles.timeInput}
                                    onBlur={() => {
                                        const n = normalizeTimeInput(sleepTime);
                                        if (n) {
                                            setSleepTime(n);
                                            setSleepDate(timeFromHHmm(n));
                                        }
                                    }}
                                />
                            ) : (
                                <>
                                    <Pressable
                                        onPress={() => {
                                            setWakePickerOpen(false);
                                            setSleepPickerOpen(true);
                                        }}
                                        style={styles.timeCard}
                                    >
                                        <Text style={styles.timeValue}>
                                            {sleepTime}
                                        </Text>
                                        <Text style={styles.timeHint}>
                                            Tap to change
                                        </Text>
                                    </Pressable>
                                    {sleepPickerOpen ? (
                                        <DateTimePicker
                                            value={sleepDate}
                                            mode="time"
                                            is24Hour
                                            display={
                                                Platform.OS === "ios"
                                                    ? "spinner"
                                                    : "default"
                                            }
                                            onChange={onSleepChange}
                                        />
                                    ) : null}
                                    {Platform.OS === "ios" && sleepPickerOpen ? (
                                        <Pressable
                                            style={styles.timeDone}
                                            onPress={() =>
                                                setSleepPickerOpen(false)
                                            }
                                        >
                                            <Text style={styles.timeDoneText}>
                                                Done
                                            </Text>
                                        </Pressable>
                                    ) : null}
                                </>
                            )}

                            <Text style={styles.section}>Wake up</Text>
                            {Platform.OS === "web" ? (
                                <TextInput
                                    value={wakeTime}
                                    onChangeText={setWakeTime}
                                    placeholder="07:00"
                                    keyboardType="numbers-and-punctuation"
                                    style={styles.timeInput}
                                    onBlur={() => {
                                        const n = normalizeTimeInput(wakeTime);
                                        if (n) {
                                            setWakeTime(n);
                                            setWakeDate(timeFromHHmm(n));
                                        }
                                    }}
                                />
                            ) : (
                                <>
                                    <Pressable
                                        onPress={() => {
                                            setSleepPickerOpen(false);
                                            setWakePickerOpen(true);
                                        }}
                                        style={styles.timeCard}
                                    >
                                        <Text style={styles.timeValue}>
                                            {wakeTime}
                                        </Text>
                                        <Text style={styles.timeHint}>
                                            Tap to change
                                        </Text>
                                    </Pressable>
                                    {wakePickerOpen ? (
                                        <DateTimePicker
                                            value={wakeDate}
                                            mode="time"
                                            is24Hour
                                            display={
                                                Platform.OS === "ios"
                                                    ? "spinner"
                                                    : "default"
                                            }
                                            onChange={onWakeChange}
                                        />
                                    ) : null}
                                    {Platform.OS === "ios" && wakePickerOpen ? (
                                        <Pressable
                                            style={styles.timeDone}
                                            onPress={() =>
                                                setWakePickerOpen(false)
                                            }
                                        >
                                            <Text style={styles.timeDoneText}>
                                                Done
                                            </Text>
                                        </Pressable>
                                    ) : null}
                                </>
                            )}
                            {Platform.OS === "web" ? (
                                <Text style={styles.webTimeHint}>
                                    Use 24-hour time, e.g. 23:00
                                </Text>
                            ) : null}
                        </View>
                    ) : null}

                    {step === 1 ? (
                        <View style={styles.stepBody}>
                            <Text style={styles.section}>
                                What fills your week?
                            </Text>
                            <Text style={styles.helper}>
                                Choose all that apply — work, study, gym, and
                                more.
                            </Text>
                            <View style={styles.chipsWrap}>
                                {WEEKLY_ACTIVITIES.map((item) => (
                                    <SelectChip
                                        key={item}
                                        label={formatLabel(item)}
                                        selected={weeklyActivities.includes(
                                            item,
                                        )}
                                        onPress={() =>
                                            toggleListItem(
                                                item,
                                                setWeeklyActivities,
                                            )
                                        }
                                        styleSheet={styles}
                                    />
                                ))}
                            </View>
                        </View>
                    ) : null}

                    {step === 2 ? (
                        <View style={styles.stepBody}>
                            <Text style={styles.section}>Meal preferences</Text>
                            <Text style={styles.helper}>
                                Tap to select. Weekend goals helps us suggest
                                events and easy wins for your days off.
                            </Text>
                            <View style={styles.mealList}>
                                {MEAL_PREFS.map((item) => {
                                    const selected =
                                        mealPreferences.includes(item);
                                    const sub = mealPrefSubtitle(item);
                                    return (
                                        <Pressable
                                            key={item}
                                            onPress={() =>
                                                toggleListItem(
                                                    item,
                                                    setMealPreferences,
                                                )
                                            }
                                            style={[
                                                styles.mealRow,
                                                selected &&
                                                    styles.mealRowSelected,
                                            ]}
                                        >
                                            <View style={styles.mealRowText}>
                                                <Text
                                                    style={[
                                                        styles.mealRowTitle,
                                                        selected &&
                                                            styles.mealRowTitleSelected,
                                                    ]}
                                                >
                                                    {mealPrefLabel(item)}
                                                </Text>
                                                {sub ? (
                                                    <Text
                                                        style={
                                                            styles.mealRowSub
                                                        }
                                                    >
                                                        {sub}
                                                    </Text>
                                                ) : null}
                                            </View>
                                            <View
                                                style={[
                                                    styles.mealCheck,
                                                    selected &&
                                                        styles.mealCheckOn,
                                                ]}
                                            >
                                                {selected ? (
                                                    <Text
                                                        style={
                                                            styles.mealCheckMark
                                                        }
                                                    >
                                                        ✓
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <Text style={styles.section}>
                                Weekly outing budget
                            </Text>
                            <Text style={styles.helper}>
                                Choose a range, then adjust the slider or type
                                any amount.
                            </Text>
                            <View style={styles.tierRow}>
                                {[
                                    {
                                        id: "low",
                                        title: "Low",
                                        hint: `1–${BUDGET_TIER_LOW.max} / wk`,
                                    },
                                    {
                                        id: "medium",
                                        title: "Medium",
                                        hint: `${BUDGET_TIER_MEDIUM.min.toLocaleString()}–${BUDGET_TIER_MEDIUM.max.toLocaleString()} / wk`,
                                    },
                                    {
                                        id: "flexible",
                                        title: "Flexible",
                                        hint: "Type any amount",
                                    },
                                ].map((t) => (
                                    <Pressable
                                        key={t.id}
                                        onPress={() =>
                                            applyBudgetTier(t.id)
                                        }
                                        style={[
                                            styles.tierChip,
                                            budgetTier === t.id &&
                                                styles.tierChipSelected,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.tierChipTitle,
                                                budgetTier === t.id &&
                                                    styles.tierChipTitleSelected,
                                            ]}
                                        >
                                            {t.title}
                                        </Text>
                                        <Text style={styles.tierChipHint}>
                                            {t.hint}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>

                            {budgetTier === "flexible" ? (
                                <View style={styles.budgetCard}>
                                    <Text style={styles.flexLabel}>
                                        Amount per week
                                    </Text>
                                    <TextInput
                                        value={flexibleBudgetText}
                                        onChangeText={setFlexibleBudgetText}
                                        keyboardType="numeric"
                                        placeholder="e.g. 2500"
                                        placeholderTextColor={
                                            palette.textMuted
                                        }
                                        style={styles.flexInput}
                                    />
                                </View>
                            ) : (
                                <View style={styles.budgetCard}>
                                    <Text style={styles.budgetNumber}>
                                        {Math.round(weeklyBudget)}
                                    </Text>
                                    <Text style={styles.budgetUnit}>
                                        per week
                                    </Text>
                                    <Slider
                                        style={styles.slider}
                                        minimumValue={
                                            budgetTier === "low"
                                                ? BUDGET_TIER_LOW.min
                                                : BUDGET_TIER_MEDIUM.min
                                        }
                                        maximumValue={
                                            budgetTier === "low"
                                                ? BUDGET_TIER_LOW.max
                                                : BUDGET_TIER_MEDIUM.max
                                        }
                                        step={BUDGET_STEP}
                                        value={weeklyBudget}
                                        onValueChange={setWeeklyBudget}
                                        minimumTrackTintColor={
                                            palette.oceanBlue
                                        }
                                        maximumTrackTintColor={
                                            palette.borderStrong
                                        }
                                        thumbTintColor={palette.deepBlue}
                                    />
                                    <View style={styles.sliderEnds}>
                                        <Text style={styles.sliderEndLabel}>
                                            {budgetTier === "low"
                                                ? BUDGET_TIER_LOW.min
                                                : BUDGET_TIER_MEDIUM.min}
                                        </Text>
                                        <Text style={styles.sliderEndLabel}>
                                            {budgetTier === "low"
                                                ? BUDGET_TIER_LOW.max
                                                : BUDGET_TIER_MEDIUM.max}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            <Text style={styles.section}>
                                Place vibe (outings)
                            </Text>
                            <Text style={styles.helper}>
                                Indoor, outdoor, or a mix — for place ideas.
                            </Text>
                            <View style={styles.inlineOptions}>
                                {LOCATION_PREF.map((item) => (
                                    <SelectChip
                                        key={item}
                                        label={formatLabel(item)}
                                        selected={locationPreference === item}
                                        onPress={() =>
                                            setLocationPreference(item)
                                        }
                                        styleSheet={styles}
                                    />
                                ))}
                            </View>
                        </View>
                    ) : null}
                </ScrollView>

                <View style={styles.footerRow}>
                    {step > 0 ? (
                        <Pressable
                            onPress={goBack}
                            disabled={saving}
                            style={styles.secondaryBtnWrap}
                        >
                            <Text style={styles.secondaryBtnText}>Back</Text>
                        </Pressable>
                    ) : (
                        <View style={styles.footerSpacer} />
                    )}
                    <Pressable
                        onPress={isLastStep ? saveAndContinue : goNext}
                        disabled={
                            (!isLastStep && !canGoNext) ||
                            (isLastStep && (!stepValid || saving))
                        }
                        style={[
                            styles.ctaWrap,
                            ((!isLastStep && !canGoNext) ||
                                (isLastStep && (!stepValid || saving))) &&
                                styles.ctaDisabled,
                        ]}
                    >
                        <LinearGradient
                            colors={gradients.primaryButton}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.cta}
                        >
                            <Text style={styles.ctaText}>
                                {saving
                                    ? "Saving..."
                                    : isLastStep
                                      ? "Continue"
                                      : "Next"}
                            </Text>
                        </LinearGradient>
                    </Pressable>
                </View>
            </LinearGradient>
        </SafeAreaView>
    );
}

function createStyles(palette) {
    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: palette.pageTop,
        },
        screen: {
            flex: 1,
            paddingHorizontal: 20,
        },
        scrollContent: {
            paddingBottom: 120,
        },
        step: {
            marginTop: 6,
            color: palette.textMuted,
            fontSize: 11,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 1.2,
        },
        progressTrack: {
            marginTop: 8,
            height: 4,
            borderRadius: 999,
            backgroundColor: "rgba(10, 108, 168, 0.2)",
            overflow: "hidden",
        },
        progressFill: {
            height: "100%",
            borderRadius: 999,
            backgroundColor: palette.oceanBlue,
        },
        stepCounter: {
            marginTop: 10,
            color: palette.textSecondary,
            fontSize: 13,
            fontWeight: "700",
        },
        title: {
            marginTop: 16,
            color: palette.textPrimary,
            fontSize: 32,
            lineHeight: 38,
            fontWeight: "800",
        },
        subtitle: {
            marginTop: 8,
            color: palette.textSecondary,
            fontSize: 15,
            lineHeight: 22,
        },
        stepBody: {
            marginTop: 8,
        },
        section: {
            marginTop: 20,
            marginBottom: 8,
            color: palette.textMuted,
            fontSize: 11,
            letterSpacing: 1.1,
            textTransform: "uppercase",
            fontWeight: "800",
        },
        helper: {
            color: palette.textSecondary,
            fontSize: 13,
            lineHeight: 20,
            marginBottom: 4,
        },
        errorText: {
            color: palette.danger,
            fontSize: 12,
            marginTop: 12,
            marginBottom: 8,
        },
        timeCard: {
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            paddingVertical: 16,
            paddingHorizontal: 18,
        },
        timeValue: {
            color: palette.textPrimary,
            fontSize: 28,
            fontWeight: "800",
            letterSpacing: 0.5,
        },
        timeHint: {
            marginTop: 4,
            color: palette.textMuted,
            fontSize: 12,
        },
        timeInput: {
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            paddingVertical: 14,
            paddingHorizontal: 16,
            color: palette.textPrimary,
            fontSize: 20,
            fontWeight: "800",
        },
        webTimeHint: {
            marginTop: 8,
            color: palette.textMuted,
            fontSize: 12,
        },
        timeDone: {
            alignSelf: "flex-end",
            marginTop: 8,
            paddingVertical: 8,
            paddingHorizontal: 12,
        },
        timeDoneText: {
            color: palette.oceanBlue,
            fontWeight: "800",
            fontSize: 16,
        },
        chipsWrap: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        chip: {
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            paddingHorizontal: 13,
            paddingVertical: 8,
        },
        chipSelected: {
            borderColor: palette.oceanBlue,
            backgroundColor: "rgba(31, 159, 234, 0.18)",
        },
        chipText: {
            color: palette.textSecondary,
            fontSize: 12,
            fontWeight: "700",
        },
        chipTextSelected: {
            color: palette.deepBlue,
        },
        inlineOptions: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        budgetCard: {
            marginTop: 4,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 16,
        },
        budgetNumber: {
            color: palette.textPrimary,
            fontSize: 36,
            fontWeight: "800",
            textAlign: "center",
        },
        budgetUnit: {
            color: palette.textMuted,
            fontSize: 12,
            textAlign: "center",
            marginBottom: 8,
        },
        slider: {
            width: "100%",
            height: 44,
        },
        sliderEnds: {
            flexDirection: "row",
            justifyContent: "space-between",
        },
        sliderEndLabel: {
            color: palette.textMuted,
            fontSize: 11,
        },
        mealList: {
            gap: 8,
        },
        mealRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            paddingVertical: 12,
            paddingHorizontal: 14,
        },
        mealRowSelected: {
            borderColor: palette.oceanBlue,
            backgroundColor: "rgba(31, 159, 234, 0.14)",
        },
        mealRowText: {
            flex: 1,
            paddingRight: 12,
        },
        mealRowTitle: {
            color: palette.textPrimary,
            fontSize: 15,
            fontWeight: "700",
        },
        mealRowTitleSelected: {
            color: palette.deepBlue,
        },
        mealRowSub: {
            marginTop: 4,
            color: palette.textSecondary,
            fontSize: 12,
            lineHeight: 17,
        },
        mealCheck: {
            width: 24,
            height: 24,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: palette.borderStrong,
            alignItems: "center",
            justifyContent: "center",
        },
        mealCheckOn: {
            borderColor: palette.oceanBlue,
            backgroundColor: "rgba(31, 159, 234, 0.25)",
        },
        mealCheckMark: {
            color: palette.deepBlue,
            fontSize: 14,
            fontWeight: "900",
        },
        tierRow: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 10,
        },
        tierChip: {
            flexGrow: 1,
            flexBasis: "30%",
            minWidth: 100,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            paddingVertical: 10,
            paddingHorizontal: 10,
        },
        tierChipSelected: {
            borderColor: palette.emerald,
            backgroundColor: "rgba(38, 201, 122, 0.12)",
        },
        tierChipTitle: {
            color: palette.textPrimary,
            fontSize: 13,
            fontWeight: "800",
        },
        tierChipTitleSelected: {
            color: palette.deepBlue,
        },
        tierChipHint: {
            marginTop: 4,
            color: palette.textMuted,
            fontSize: 10,
            lineHeight: 14,
        },
        flexLabel: {
            color: palette.textMuted,
            fontSize: 12,
            fontWeight: "700",
            marginBottom: 8,
        },
        flexInput: {
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surfaceStrong,
            paddingVertical: 12,
            paddingHorizontal: 14,
            color: palette.textPrimary,
            fontSize: 20,
            fontWeight: "800",
        },
        footerRow: {
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 26,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
        },
        footerSpacer: {
            width: 88,
        },
        secondaryBtnWrap: {
            width: 88,
            height: 54,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            alignItems: "center",
            justifyContent: "center",
        },
        secondaryBtnText: {
            color: palette.textSecondary,
            fontWeight: "800",
            fontSize: 15,
        },
        ctaWrap: {
            flex: 1,
            borderRadius: 16,
            overflow: "hidden",
        },
        cta: {
            height: 54,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#2FAAFF",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.24,
            shadowRadius: 14,
            elevation: 7,
        },
        ctaDisabled: {
            opacity: 0.5,
        },
        ctaText: {
            color: palette.iceWhite,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.5,
        },
    });
}
