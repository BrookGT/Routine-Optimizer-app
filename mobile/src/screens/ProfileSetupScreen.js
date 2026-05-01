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

/**
 * Onboarding flow — 5 steps:
 *  0. Personal info  (working hours + religion)
 *  1. Sleep & wake   (existing)
 *  2. Your week      (existing — weekly activities)
 *  3. Daily routine  (morning activity/breakfast, lunch, dinner, custom)
 *  4. Food & budget  (meal prefs, budget, location, weekend pref, event interests)
 */
const STEPS = 5;

// ─── Static option lists ───────────────────────────────────────────────────────

const RELIGIONS = [
    "protestant",
    "orthodox",
    "muslim",
    "other",
    "prefer_not_to_say",
];

const RELIGION_LABELS = {
    protestant:       "Protestant",
    orthodox:         "Orthodox",
    muslim:           "Muslim",
    other:            "Other",
    prefer_not_to_say: "Prefer not to say",
};

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

const MEAL_TYPES = [
    "vegetarian",
    "simple_snacks",
    "protein_rich",
    "other",
];

const MEAL_TYPE_LABELS = {
    vegetarian:    "Vegetarian",
    simple_snacks: "Simple snacks",
    protein_rich:  "Protein-rich",
    other:         "Other",
};

const MORNING_ACTIVITIES = [
    "gym",
    "reading",
    "walking",
    "sports",
    "cooking",
    "other",
];

const LOCATION_PREF = ["indoor", "outdoor", "any"];

const WEEKEND_PREFS = ["indoor", "outdoor", "hiking", "other"];

const EVENT_INTERESTS = [
    "tech",
    "religious",
    "trainings",
    "social",
    "other",
];

const EVENT_INTEREST_LABELS = {
    tech:      "Tech",
    religious: "Religious",
    trainings: "Trainings",
    social:    "Social",
    other:     "Other",
};

const BUDGET_TIER_LOW    = { min: 1,    max: 1000  };
const BUDGET_TIER_MEDIUM = { min: 1000, max: 10000 };
const BUDGET_STEP = 10;

// ─── Utility functions ─────────────────────────────────────────────────────────

function formatLabel(value) {
    if (!value || typeof value !== "string") return "";
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
    const match = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function deriveBudgetRange(amount) {
    if (amount <= 1500) return "low";
    if (amount <= 6500) return "medium";
    return "high";
}

function inferBudgetTierFromAmount(amount) {
    if (typeof amount !== "number" || Number.isNaN(amount)) return "low";
    if (amount <= BUDGET_TIER_LOW.max) return "low";
    if (amount <= BUDGET_TIER_MEDIUM.max) return "medium";
    return "flexible";
}

function mealPrefLabel(id) {
    if (id === "weekend_goals") return "Weekend goals";
    return formatLabel(id);
}

function mealPrefSubtitle(id) {
    if (id === "weekend_goals") return "Helps tailor weekend events & light tasks for you";
    return null;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SelectChip({ label, selected, onPress, styleSheet }) {
    return (
        <Pressable
            onPress={onPress}
            style={[styleSheet.chip, selected && styleSheet.chipSelected]}
        >
            <Text style={[styleSheet.chipText, selected && styleSheet.chipTextSelected]}>
                {label}
            </Text>
        </Pressable>
    );
}

/** Inline time text-input for working-hours fields (all platforms). */
function TimeTextInput({ value, onChange, placeholder, styles }) {
    return (
        <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder || "00:00"}
            keyboardType="numbers-and-punctuation"
            style={styles.timeInput}
            onBlur={() => {
                const n = normalizeTimeInput(value);
                if (n) onChange(n);
            }}
        />
    );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function ProfileSetupScreen({ navigation }) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);
    const { refreshProfile } = useAuth();

    // ── Navigation state ─────────────────────────────────────────────────────
    const [step, setStep] = useState(0);

    // ── Step 0: Personal info ─────────────────────────────────────────────────
    const [workingHoursFlexible, setWorkingHoursFlexible] = useState(false);
    const [morningStart, setMorningStart]   = useState("08:00");
    const [morningEnd,   setMorningEnd]     = useState("12:00");
    const [afternoonStart, setAfternoonStart] = useState("13:00");
    const [afternoonEnd,   setAfternoonEnd]   = useState("17:00");
    const [religion, setReligion] = useState("");

    // ── Step 1: Sleep & wake ──────────────────────────────────────────────────
    const [sleepTime, setSleepTime]     = useState("23:00");
    const [wakeTime,  setWakeTime]      = useState("07:00");
    const [sleepPickerOpen, setSleepPickerOpen] = useState(false);
    const [wakePickerOpen,  setWakePickerOpen]  = useState(false);
    const [sleepDate, setSleepDate] = useState(() => timeFromHHmm("23:00"));
    const [wakeDate,  setWakeDate]  = useState(() => timeFromHHmm("07:00"));

    // ── Step 2: Weekly activities ─────────────────────────────────────────────
    const [weeklyActivities, setWeeklyActivities] = useState([]);

    // ── Step 3: Daily routine ─────────────────────────────────────────────────
    const [morningActivities,  setMorningActivities]  = useState([]);
    const [breakfastType,      setBreakfastType]      = useState("");
    const [lunchTime,          setLunchTime]          = useState("12:00");
    const [lunchType,          setLunchType]          = useState("");
    const [dinnerTime,         setDinnerTime]         = useState("19:00");
    const [dinnerType,         setDinnerType]         = useState("");
    const [customActivityInput, setCustomActivityInput] = useState("");
    const [customActivities,   setCustomActivities]   = useState([]);
    const [lunchPickerOpen,  setLunchPickerOpen]  = useState(false);
    const [dinnerPickerOpen, setDinnerPickerOpen] = useState(false);
    const [lunchDate,  setLunchDate]  = useState(() => timeFromHHmm("12:00"));
    const [dinnerDate, setDinnerDate] = useState(() => timeFromHHmm("19:00"));

    // ── Step 4: Food, budget, weekend, events ─────────────────────────────────
    const [mealPreferences, setMealPreferences] = useState([]);
    const [budgetTier, setBudgetTier]           = useState("low");
    const [weeklyBudget, setWeeklyBudget]       = useState(200);
    const [flexibleBudgetText, setFlexibleBudgetText] = useState("200");
    const [locationPreference, setLocationPreference] = useState("any");
    const [weekendPreference,  setWeekendPreference]  = useState("");
    const [eventInterests,     setEventInterests]     = useState([]);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState("");

    // ── Profile load ──────────────────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;

        async function loadProfile() {
            try {
                setLoading(true);
                setError("");
                const envelope = await getProfile();
                const profile  = unwrapApiData(envelope, {});
                if (!mounted) return;

                // Step 0 — working hours
                if (profile?.workingHours) {
                    const wh = profile.workingHours;
                    if (wh.flexible) {
                        setWorkingHoursFlexible(true);
                    } else {
                        if (wh.morning?.start) setMorningStart(wh.morning.start);
                        if (wh.morning?.end)   setMorningEnd(wh.morning.end);
                        if (wh.afternoon?.start) setAfternoonStart(wh.afternoon.start);
                        if (wh.afternoon?.end)   setAfternoonEnd(wh.afternoon.end);
                    }
                }
                if (profile?.religion) setReligion(profile.religion);

                // Step 1 — sleep / wake
                if (profile?.sleepTime) {
                    setSleepTime(profile.sleepTime);
                    setSleepDate(timeFromHHmm(profile.sleepTime));
                }
                if (profile?.wakeTime) {
                    setWakeTime(profile.wakeTime);
                    setWakeDate(timeFromHHmm(profile.wakeTime));
                }

                // Step 2 — weekly activities
                if (Array.isArray(profile?.weeklyActivities) && profile.weeklyActivities.length > 0) {
                    setWeeklyActivities(profile.weeklyActivities);
                } else if (Array.isArray(profile?.interests) && profile.interests.length > 0) {
                    setWeeklyActivities(
                        profile.interests.filter((x) => WEEKLY_ACTIVITIES.includes(x)),
                    );
                }

                // Step 3 — daily routine
                if (profile?.dailyRoutine) {
                    const dr = profile.dailyRoutine;
                    if (Array.isArray(dr.morning?.activities)) setMorningActivities(dr.morning.activities);
                    if (dr.morning?.breakfastType) setBreakfastType(dr.morning.breakfastType);
                    if (dr.afternoon?.lunchTime) {
                        setLunchTime(dr.afternoon.lunchTime);
                        setLunchDate(timeFromHHmm(dr.afternoon.lunchTime));
                    }
                    if (dr.afternoon?.lunchType)  setLunchType(dr.afternoon.lunchType);
                    if (dr.evening?.dinnerTime) {
                        setDinnerTime(dr.evening.dinnerTime);
                        setDinnerDate(timeFromHHmm(dr.evening.dinnerTime));
                    }
                    if (dr.evening?.dinnerType) setDinnerType(dr.evening.dinnerType);
                    if (Array.isArray(dr.customActivities)) setCustomActivities(dr.customActivities);
                }

                // Step 4 — food, budget, location, weekend, events
                if (Array.isArray(profile?.mealPreferences) && profile.mealPreferences.length > 0) {
                    setMealPreferences(profile.mealPreferences);
                }
                if (typeof profile?.weeklyBudget === "number") {
                    const amt = profile.weeklyBudget;
                    setWeeklyBudget(amt);
                    setFlexibleBudgetText(String(Math.round(amt)));
                    setBudgetTier(inferBudgetTierFromAmount(amt));
                }
                if (profile?.locationPreference) setLocationPreference(profile.locationPreference);
                if (profile?.weekendPreference)  setWeekendPreference(profile.weekendPreference);
                if (Array.isArray(profile?.eventInterests)) setEventInterests(profile.eventInterests);
            } catch (err) {
                if (mounted) setError(getApiErrorMessage(err, "Unable to load profile."));
            } finally {
                if (mounted) setLoading(false);
            }
        }

        loadProfile();
        return () => { mounted = false; };
    }, []);

    // ── Step validation ───────────────────────────────────────────────────────
    const stepValid = useMemo(() => {
        if (step === 0) return true; // personal info is optional / skippable
        if (step === 1) {
            return (
                !!normalizeTimeInput(sleepTime) &&
                !!normalizeTimeInput(wakeTime)
            );
        }
        if (step === 2) return weeklyActivities.length > 0;
        if (step === 3) return true; // daily routine is optional / skippable
        // step 4
        const budgetOk =
            budgetTier === "flexible"
                ? (() => {
                      const n = parseFloat(String(flexibleBudgetText).replace(/,/g, ""));
                      return Number.isFinite(n) && n >= 1;
                  })()
                : typeof weeklyBudget === "number" && weeklyBudget >= 1;
        return mealPreferences.length > 0 && budgetOk && !!locationPreference;
    }, [
        step, sleepTime, wakeTime, weeklyActivities,
        mealPreferences, weeklyBudget, budgetTier, flexibleBudgetText, locationPreference,
    ]);

    const canGoNext  = stepValid && !loading;
    const isLastStep = step === STEPS - 1;

    // ── Helpers ───────────────────────────────────────────────────────────────
    function toggleListItem(item, setList) {
        setList((current) =>
            current.includes(item) ? current.filter((x) => x !== item) : [...current, item],
        );
    }

    function onSleepChange(_e, date) {
        if (Platform.OS === "android") setSleepPickerOpen(false);
        if (date) { setSleepDate(date); setSleepTime(toHHmm(date)); }
    }
    function onWakeChange(_e, date) {
        if (Platform.OS === "android") setWakePickerOpen(false);
        if (date) { setWakeDate(date); setWakeTime(toHHmm(date)); }
    }
    function onLunchChange(_e, date) {
        if (Platform.OS === "android") setLunchPickerOpen(false);
        if (date) { setLunchDate(date); setLunchTime(toHHmm(date)); }
    }
    function onDinnerChange(_e, date) {
        if (Platform.OS === "android") setDinnerPickerOpen(false);
        if (date) { setDinnerDate(date); setDinnerTime(toHHmm(date)); }
    }

    function applyBudgetTier(tier) {
        setBudgetTier(tier);
        if (tier === "low") {
            setWeeklyBudget((v) =>
                Math.min(BUDGET_TIER_LOW.max, Math.max(BUDGET_TIER_LOW.min, v ?? 200)),
            );
        } else if (tier === "medium") {
            setWeeklyBudget((v) => {
                const x = v ?? 2500;
                const clamped = Math.min(BUDGET_TIER_MEDIUM.max, Math.max(BUDGET_TIER_MEDIUM.min, x));
                return x < BUDGET_TIER_MEDIUM.min ? 2500 : clamped;
            });
        } else {
            setFlexibleBudgetText(String(Math.round(weeklyBudget || 500)));
        }
    }

    function addCustomActivity() {
        const trimmed = customActivityInput.trim();
        if (!trimmed || customActivities.includes(trimmed)) return;
        setCustomActivities((c) => [...c, trimmed]);
        setCustomActivityInput("");
    }

    function goNext() {
        if (!canGoNext || saving) return;
        setError("");
        if (step < STEPS - 1) setStep((s) => s + 1);
    }

    function goBack() {
        setError("");
        if (step > 0) setStep((s) => s - 1);
    }

    async function saveAndContinue() {
        if (!stepValid || saving) return;

        try {
            setSaving(true);
            setError("");

            let amount =
                budgetTier === "flexible"
                    ? Math.round(parseFloat(String(flexibleBudgetText).replace(/,/g, "")) || 0)
                    : Math.round(weeklyBudget);
            if (!Number.isFinite(amount) || amount < 1) amount = 1;

            const budgetRange = deriveBudgetRange(amount);
            const sleepOut    = normalizeTimeInput(sleepTime) ?? toHHmm(sleepDate);
            const wakeOut     = normalizeTimeInput(wakeTime)  ?? toHHmm(wakeDate);

            const workingHours = workingHoursFlexible
                ? { flexible: true }
                : {
                      morning:   { start: morningStart,   end: morningEnd },
                      afternoon: { start: afternoonStart, end: afternoonEnd },
                      flexible:  false,
                  };

            const dailyRoutine = {
                morning: {
                    activities:    morningActivities,
                    breakfastType: breakfastType,
                },
                afternoon: {
                    lunchTime: lunchTime,
                    lunchType: lunchType,
                },
                evening: {
                    dinnerTime: dinnerTime,
                    dinnerType: dinnerType,
                },
                customActivities: customActivities,
            };

            await updateProfile({
                // existing fields
                sleepTime:         sleepOut,
                wakeTime:          wakeOut,
                weeklyActivities,
                mealPreferences,
                weeklyBudget:      amount,
                budgetRange,
                locationPreference,
                interests:         weeklyActivities,
                // new fields
                workingHours,
                religion,
                dailyRoutine,
                weekendPreference,
                eventInterests,
            });

            await refreshProfile();
            navigation.navigate("RoutineBuilder");
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to save profile."));
        } finally {
            setSaving(false);
        }
    }

    // ── Derived display ───────────────────────────────────────────────────────
    const progressWidth = `${((step + 1) / STEPS) * 100}%`;

    const STEP_TITLES = [
        "Personal info",
        "Sleep & wake",
        "Your typical week",
        "Daily routine",
        "Food & budget",
    ];

    const STEP_HINTS = [
        "Helps us respect your schedule and culture.",
        "We use this to respect your energy and timing.",
        "Pick everything that regularly shapes your week.",
        "Your daily rhythm helps us time suggestions perfectly.",
        "Meals and spend help recommendations feel realistic.",
    ];

    // ── Render time-picker block (native) ─────────────────────────────────────
    function renderTimePicker(label, timeVal, pickerOpen, setPickerOpen, dateVal, onChange) {
        return (
            <View>
                <Text style={styles.section}>{label}</Text>
                {Platform.OS === "web" ? (
                    <TextInput
                        value={timeVal}
                        onChangeText={(v) => {
                            // handled inline via onChange
                            const setter = label === "Bedtime" ? setSleepTime
                                : label === "Wake up" ? setWakeTime
                                : label === "Lunch time" ? setLunchTime
                                : setDinnerTime;
                            setter(v);
                        }}
                        placeholder="00:00"
                        keyboardType="numbers-and-punctuation"
                        style={styles.timeInput}
                    />
                ) : (
                    <>
                        <Pressable
                            onPress={() => setPickerOpen(true)}
                            style={styles.timeCard}
                        >
                            <Text style={styles.timeValue}>{timeVal}</Text>
                            <Text style={styles.timeHint}>Tap to change</Text>
                        </Pressable>
                        {pickerOpen ? (
                            <DateTimePicker
                                value={dateVal}
                                mode="time"
                                is24Hour
                                display={Platform.OS === "ios" ? "spinner" : "default"}
                                onChange={onChange}
                            />
                        ) : null}
                        {Platform.OS === "ios" && pickerOpen ? (
                            <Pressable
                                style={styles.timeDone}
                                onPress={() => setPickerOpen(false)}
                            >
                                <Text style={styles.timeDoneText}>Done</Text>
                            </Pressable>
                        ) : null}
                    </>
                )}
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient colors={gradients.appBackground} style={styles.screen}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Header / progress */}
                    <Text style={styles.step}>Step 1 of 2 · Profile</Text>
                    <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: progressWidth }]} />
                    </View>
                    <Text style={styles.stepCounter}>
                        {step + 1} / {STEPS} — {STEP_TITLES[step]}
                    </Text>

                    <Text style={styles.title}>Tell us about you</Text>
                    <Text style={styles.subtitle}>{STEP_HINTS[step]}</Text>

                    {loading ? <Loader /> : null}
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    {/* ── STEP 0: Personal info ────────────────────────────── */}
                    {step === 0 ? (
                        <View style={styles.stepBody}>
                            {/* Working hours */}
                            <Text style={styles.section}>Working hours</Text>
                            <Text style={styles.helper}>
                                Tell us when you're usually at work so we avoid scheduling
                                suggestions during those times.
                            </Text>

                            {/* Flexible toggle */}
                            <Pressable
                                onPress={() => setWorkingHoursFlexible((v) => !v)}
                                style={[
                                    styles.flexToggle,
                                    workingHoursFlexible && styles.flexToggleOn,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.flexToggleText,
                                        workingHoursFlexible && styles.flexToggleTextOn,
                                    ]}
                                >
                                    {workingHoursFlexible
                                        ? "Flexible / I'll set this later"
                                        : "I have fixed hours"}
                                </Text>
                            </Pressable>

                            {!workingHoursFlexible ? (
                                <View style={styles.workingHoursCard}>
                                    <Text style={styles.whLabel}>Morning</Text>
                                    <View style={styles.timeRangeRow}>
                                        <View style={styles.timeRangeField}>
                                            <Text style={styles.timeRangeHint}>Start</Text>
                                            <TimeTextInput
                                                value={morningStart}
                                                onChange={setMorningStart}
                                                placeholder="08:00"
                                                styles={styles}
                                            />
                                        </View>
                                        <Text style={styles.timeRangeDash}>–</Text>
                                        <View style={styles.timeRangeField}>
                                            <Text style={styles.timeRangeHint}>End</Text>
                                            <TimeTextInput
                                                value={morningEnd}
                                                onChange={setMorningEnd}
                                                placeholder="12:00"
                                                styles={styles}
                                            />
                                        </View>
                                    </View>

                                    <Text style={[styles.whLabel, { marginTop: 14 }]}>Afternoon</Text>
                                    <View style={styles.timeRangeRow}>
                                        <View style={styles.timeRangeField}>
                                            <Text style={styles.timeRangeHint}>Start</Text>
                                            <TimeTextInput
                                                value={afternoonStart}
                                                onChange={setAfternoonStart}
                                                placeholder="13:00"
                                                styles={styles}
                                            />
                                        </View>
                                        <Text style={styles.timeRangeDash}>–</Text>
                                        <View style={styles.timeRangeField}>
                                            <Text style={styles.timeRangeHint}>End</Text>
                                            <TimeTextInput
                                                value={afternoonEnd}
                                                onChange={setAfternoonEnd}
                                                placeholder="17:00"
                                                styles={styles}
                                            />
                                        </View>
                                    </View>
                                    <Text style={styles.webTimeHint}>Use 24-hour format, e.g. 08:00</Text>
                                </View>
                            ) : null}

                            {/* Religion */}
                            <Text style={[styles.section, { marginTop: 24 }]}>Religion</Text>
                            <Text style={styles.helper}>
                                Helps us suggest culturally relevant events and timings.
                            </Text>
                            <View style={styles.chipsWrap}>
                                {RELIGIONS.map((r) => (
                                    <SelectChip
                                        key={r}
                                        label={RELIGION_LABELS[r]}
                                        selected={religion === r}
                                        onPress={() => setReligion(religion === r ? "" : r)}
                                        styleSheet={styles}
                                    />
                                ))}
                            </View>

                            <Text style={styles.skipHint}>
                                Both sections are optional — tap Next to skip.
                            </Text>
                        </View>
                    ) : null}

                    {/* ── STEP 1: Sleep & wake (existing) ─────────────────── */}
                    {step === 1 ? (
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
                                        if (n) { setSleepTime(n); setSleepDate(timeFromHHmm(n)); }
                                    }}
                                />
                            ) : (
                                <>
                                    <Pressable
                                        onPress={() => { setWakePickerOpen(false); setSleepPickerOpen(true); }}
                                        style={styles.timeCard}
                                    >
                                        <Text style={styles.timeValue}>{sleepTime}</Text>
                                        <Text style={styles.timeHint}>Tap to change</Text>
                                    </Pressable>
                                    {sleepPickerOpen ? (
                                        <DateTimePicker
                                            value={sleepDate}
                                            mode="time"
                                            is24Hour
                                            display={Platform.OS === "ios" ? "spinner" : "default"}
                                            onChange={onSleepChange}
                                        />
                                    ) : null}
                                    {Platform.OS === "ios" && sleepPickerOpen ? (
                                        <Pressable style={styles.timeDone} onPress={() => setSleepPickerOpen(false)}>
                                            <Text style={styles.timeDoneText}>Done</Text>
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
                                        if (n) { setWakeTime(n); setWakeDate(timeFromHHmm(n)); }
                                    }}
                                />
                            ) : (
                                <>
                                    <Pressable
                                        onPress={() => { setSleepPickerOpen(false); setWakePickerOpen(true); }}
                                        style={styles.timeCard}
                                    >
                                        <Text style={styles.timeValue}>{wakeTime}</Text>
                                        <Text style={styles.timeHint}>Tap to change</Text>
                                    </Pressable>
                                    {wakePickerOpen ? (
                                        <DateTimePicker
                                            value={wakeDate}
                                            mode="time"
                                            is24Hour
                                            display={Platform.OS === "ios" ? "spinner" : "default"}
                                            onChange={onWakeChange}
                                        />
                                    ) : null}
                                    {Platform.OS === "ios" && wakePickerOpen ? (
                                        <Pressable style={styles.timeDone} onPress={() => setWakePickerOpen(false)}>
                                            <Text style={styles.timeDoneText}>Done</Text>
                                        </Pressable>
                                    ) : null}
                                </>
                            )}
                            {Platform.OS === "web" ? (
                                <Text style={styles.webTimeHint}>Use 24-hour time, e.g. 23:00</Text>
                            ) : null}
                        </View>
                    ) : null}

                    {/* ── STEP 2: Weekly activities (existing) ─────────────── */}
                    {step === 2 ? (
                        <View style={styles.stepBody}>
                            <Text style={styles.section}>What fills your week?</Text>
                            <Text style={styles.helper}>
                                Choose all that apply — work, study, gym, and more.
                            </Text>
                            <View style={styles.chipsWrap}>
                                {WEEKLY_ACTIVITIES.map((item) => (
                                    <SelectChip
                                        key={item}
                                        label={formatLabel(item)}
                                        selected={weeklyActivities.includes(item)}
                                        onPress={() => toggleListItem(item, setWeeklyActivities)}
                                        styleSheet={styles}
                                    />
                                ))}
                            </View>
                        </View>
                    ) : null}

                    {/* ── STEP 3: Daily routine (new) ──────────────────────── */}
                    {step === 3 ? (
                        <View style={styles.stepBody}>
                            {/* Morning */}
                            <View style={styles.routineSection}>
                                <Text style={styles.routineSectionTitle}>Morning</Text>

                                <Text style={styles.section}>Activity after waking</Text>
                                <Text style={styles.helper}>Select all that apply.</Text>
                                <View style={styles.chipsWrap}>
                                    {MORNING_ACTIVITIES.map((item) => (
                                        <SelectChip
                                            key={item}
                                            label={formatLabel(item)}
                                            selected={morningActivities.includes(item)}
                                            onPress={() => toggleListItem(item, setMorningActivities)}
                                            styleSheet={styles}
                                        />
                                    ))}
                                </View>

                                <Text style={styles.section}>Breakfast preference</Text>
                                <View style={styles.chipsWrap}>
                                    {MEAL_TYPES.map((t) => (
                                        <SelectChip
                                            key={t}
                                            label={MEAL_TYPE_LABELS[t]}
                                            selected={breakfastType === t}
                                            onPress={() => setBreakfastType(breakfastType === t ? "" : t)}
                                            styleSheet={styles}
                                        />
                                    ))}
                                </View>
                            </View>

                            {/* Afternoon */}
                            <View style={styles.routineSection}>
                                <Text style={styles.routineSectionTitle}>Afternoon</Text>

                                {renderTimePicker(
                                    "Lunch time",
                                    lunchTime,
                                    lunchPickerOpen,
                                    setLunchPickerOpen,
                                    lunchDate,
                                    onLunchChange,
                                )}

                                <Text style={styles.section}>Lunch type</Text>
                                <View style={styles.chipsWrap}>
                                    {MEAL_TYPES.map((t) => (
                                        <SelectChip
                                            key={t}
                                            label={MEAL_TYPE_LABELS[t]}
                                            selected={lunchType === t}
                                            onPress={() => setLunchType(lunchType === t ? "" : t)}
                                            styleSheet={styles}
                                        />
                                    ))}
                                </View>
                            </View>

                            {/* Evening */}
                            <View style={styles.routineSection}>
                                <Text style={styles.routineSectionTitle}>Evening</Text>

                                {renderTimePicker(
                                    "Dinner time",
                                    dinnerTime,
                                    dinnerPickerOpen,
                                    setDinnerPickerOpen,
                                    dinnerDate,
                                    onDinnerChange,
                                )}

                                <Text style={styles.section}>Dinner type</Text>
                                <View style={styles.chipsWrap}>
                                    {MEAL_TYPES.map((t) => (
                                        <SelectChip
                                            key={t}
                                            label={MEAL_TYPE_LABELS[t]}
                                            selected={dinnerType === t}
                                            onPress={() => setDinnerType(dinnerType === t ? "" : t)}
                                            styleSheet={styles}
                                        />
                                    ))}
                                </View>
                            </View>

                            {/* Custom activities */}
                            <View style={styles.routineSection}>
                                <Text style={styles.section}>Custom activities</Text>
                                <Text style={styles.helper}>
                                    Add anything not listed above (e.g. prayer, meditation, journaling).
                                </Text>
                                <View style={styles.customInputRow}>
                                    <TextInput
                                        value={customActivityInput}
                                        onChangeText={setCustomActivityInput}
                                        placeholder="e.g. journaling"
                                        placeholderTextColor={palette.textMuted}
                                        style={styles.customInput}
                                        onSubmitEditing={addCustomActivity}
                                        returnKeyType="done"
                                    />
                                    <Pressable onPress={addCustomActivity} style={styles.customAddBtn}>
                                        <Text style={styles.customAddText}>Add</Text>
                                    </Pressable>
                                </View>
                                {customActivities.length > 0 ? (
                                    <View style={[styles.chipsWrap, { marginTop: 8 }]}>
                                        {customActivities.map((act) => (
                                            <Pressable
                                                key={act}
                                                onPress={() =>
                                                    setCustomActivities((c) => c.filter((x) => x !== act))
                                                }
                                                style={[styles.chip, styles.chipSelected]}
                                            >
                                                <Text style={[styles.chipText, styles.chipTextSelected]}>
                                                    {act} ×
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                ) : null}
                            </View>

                            <Text style={styles.skipHint}>
                                All sections are optional — tap Next to skip.
                            </Text>
                        </View>
                    ) : null}

                    {/* ── STEP 4: Food, budget, weekend, events (existing + new) */}
                    {step === 4 ? (
                        <View style={styles.stepBody}>
                            {/* Meal preferences (existing) */}
                            <Text style={styles.section}>Meal preferences</Text>
                            <Text style={styles.helper}>
                                Tap to select. Weekend goals helps us suggest events and easy
                                wins for your days off.
                            </Text>
                            <View style={styles.mealList}>
                                {MEAL_PREFS.map((item) => {
                                    const selected = mealPreferences.includes(item);
                                    const sub = mealPrefSubtitle(item);
                                    return (
                                        <Pressable
                                            key={item}
                                            onPress={() => toggleListItem(item, setMealPreferences)}
                                            style={[styles.mealRow, selected && styles.mealRowSelected]}
                                        >
                                            <View style={styles.mealRowText}>
                                                <Text style={[styles.mealRowTitle, selected && styles.mealRowTitleSelected]}>
                                                    {mealPrefLabel(item)}
                                                </Text>
                                                {sub ? (
                                                    <Text style={styles.mealRowSub}>{sub}</Text>
                                                ) : null}
                                            </View>
                                            <View style={[styles.mealCheck, selected && styles.mealCheckOn]}>
                                                {selected ? (
                                                    <Text style={styles.mealCheckMark}>✓</Text>
                                                ) : null}
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            {/* Budget (existing) */}
                            <Text style={styles.section}>Weekly outing budget</Text>
                            <Text style={styles.helper}>
                                Choose a range, then adjust the slider or type any amount.
                            </Text>
                            <View style={styles.tierRow}>
                                {[
                                    { id: "low",      title: "Low",      hint: `1–${BUDGET_TIER_LOW.max} / wk` },
                                    { id: "medium",   title: "Medium",   hint: `${BUDGET_TIER_MEDIUM.min.toLocaleString()}–${BUDGET_TIER_MEDIUM.max.toLocaleString()} / wk` },
                                    { id: "flexible", title: "Flexible", hint: "Type any amount" },
                                ].map((t) => (
                                    <Pressable
                                        key={t.id}
                                        onPress={() => applyBudgetTier(t.id)}
                                        style={[styles.tierChip, budgetTier === t.id && styles.tierChipSelected]}
                                    >
                                        <Text style={[styles.tierChipTitle, budgetTier === t.id && styles.tierChipTitleSelected]}>
                                            {t.title}
                                        </Text>
                                        <Text style={styles.tierChipHint}>{t.hint}</Text>
                                    </Pressable>
                                ))}
                            </View>

                            {budgetTier === "flexible" ? (
                                <View style={styles.budgetCard}>
                                    <Text style={styles.flexLabel}>Amount per week</Text>
                                    <TextInput
                                        value={flexibleBudgetText}
                                        onChangeText={setFlexibleBudgetText}
                                        keyboardType="numeric"
                                        placeholder="e.g. 2500"
                                        placeholderTextColor={palette.textMuted}
                                        style={styles.flexInput}
                                    />
                                </View>
                            ) : (
                                <View style={styles.budgetCard}>
                                    <Text style={styles.budgetNumber}>{Math.round(weeklyBudget)}</Text>
                                    <Text style={styles.budgetUnit}>per week</Text>
                                    <Slider
                                        style={styles.slider}
                                        minimumValue={budgetTier === "low" ? BUDGET_TIER_LOW.min : BUDGET_TIER_MEDIUM.min}
                                        maximumValue={budgetTier === "low" ? BUDGET_TIER_LOW.max : BUDGET_TIER_MEDIUM.max}
                                        step={BUDGET_STEP}
                                        value={weeklyBudget}
                                        onValueChange={setWeeklyBudget}
                                        minimumTrackTintColor={palette.oceanBlue}
                                        maximumTrackTintColor={palette.borderStrong}
                                        thumbTintColor={palette.deepBlue}
                                    />
                                    <View style={styles.sliderEnds}>
                                        <Text style={styles.sliderEndLabel}>
                                            {budgetTier === "low" ? BUDGET_TIER_LOW.min : BUDGET_TIER_MEDIUM.min}
                                        </Text>
                                        <Text style={styles.sliderEndLabel}>
                                            {budgetTier === "low" ? BUDGET_TIER_LOW.max : BUDGET_TIER_MEDIUM.max}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Place vibe (existing) */}
                            <Text style={styles.section}>Place vibe (outings)</Text>
                            <Text style={styles.helper}>
                                Indoor, outdoor, or a mix — for place ideas.
                            </Text>
                            <View style={styles.inlineOptions}>
                                {LOCATION_PREF.map((item) => (
                                    <SelectChip
                                        key={item}
                                        label={formatLabel(item)}
                                        selected={locationPreference === item}
                                        onPress={() => setLocationPreference(item)}
                                        styleSheet={styles}
                                    />
                                ))}
                            </View>

                            {/* Weekend preference (new) */}
                            <Text style={styles.section}>Weekend preference</Text>
                            <Text style={styles.helper}>
                                How do you usually like to spend your weekends?
                            </Text>
                            <View style={styles.inlineOptions}>
                                {WEEKEND_PREFS.map((item) => (
                                    <SelectChip
                                        key={item}
                                        label={formatLabel(item)}
                                        selected={weekendPreference === item}
                                        onPress={() => setWeekendPreference(weekendPreference === item ? "" : item)}
                                        styleSheet={styles}
                                    />
                                ))}
                            </View>

                            {/* Event interests (new) */}
                            <Text style={styles.section}>Event interests</Text>
                            <Text style={styles.helper}>
                                What kinds of events do you enjoy? Select all that apply.
                            </Text>
                            <View style={styles.chipsWrap}>
                                {EVENT_INTERESTS.map((item) => (
                                    <SelectChip
                                        key={item}
                                        label={EVENT_INTEREST_LABELS[item]}
                                        selected={eventInterests.includes(item)}
                                        onPress={() => toggleListItem(item, setEventInterests)}
                                        styleSheet={styles}
                                    />
                                ))}
                            </View>
                        </View>
                    ) : null}
                </ScrollView>

                {/* Footer navigation */}
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
                                {saving ? "Saving..." : isLastStep ? "Continue" : "Next"}
                            </Text>
                        </LinearGradient>
                    </Pressable>
                </View>
            </LinearGradient>
        </SafeAreaView>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

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
        skipHint: {
            marginTop: 16,
            color: palette.textMuted,
            fontSize: 12,
            fontStyle: "italic",
            textAlign: "center",
        },
        // Working hours
        workingHoursCard: {
            marginTop: 4,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 16,
        },
        whLabel: {
            color: palette.textSecondary,
            fontSize: 13,
            fontWeight: "700",
            marginBottom: 8,
        },
        timeRangeRow: {
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 8,
        },
        timeRangeField: {
            flex: 1,
        },
        timeRangeHint: {
            color: palette.textMuted,
            fontSize: 11,
            marginBottom: 4,
        },
        timeRangeDash: {
            color: palette.textMuted,
            fontSize: 18,
            paddingBottom: 10,
        },
        flexToggle: {
            alignSelf: "flex-start",
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            paddingHorizontal: 14,
            paddingVertical: 9,
            marginBottom: 8,
        },
        flexToggleOn: {
            borderColor: palette.oceanBlue,
            backgroundColor: "rgba(31, 159, 234, 0.15)",
        },
        flexToggleText: {
            color: palette.textSecondary,
            fontSize: 13,
            fontWeight: "700",
        },
        flexToggleTextOn: {
            color: palette.deepBlue,
        },
        // Time picker cards (sleep/wake + lunch/dinner)
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
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            paddingVertical: 12,
            paddingHorizontal: 14,
            color: palette.textPrimary,
            fontSize: 18,
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
        // Daily routine sections
        routineSection: {
            marginTop: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 14,
        },
        routineSectionTitle: {
            color: palette.oceanBlue,
            fontSize: 14,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 4,
        },
        // Custom activities input
        customInputRow: {
            flexDirection: "row",
            gap: 8,
            marginTop: 4,
        },
        customInput: {
            flex: 1,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            paddingVertical: 10,
            paddingHorizontal: 12,
            color: palette.textPrimary,
            fontSize: 14,
        },
        customAddBtn: {
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.oceanBlue,
            backgroundColor: "rgba(31, 159, 234, 0.12)",
            paddingHorizontal: 16,
            justifyContent: "center",
        },
        customAddText: {
            color: palette.deepBlue,
            fontWeight: "800",
            fontSize: 13,
        },
        // Chips
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
        // Meal list (step 4 — existing)
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
        // Budget (existing)
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
        // Footer
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
