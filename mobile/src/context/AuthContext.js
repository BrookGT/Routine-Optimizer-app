import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    GoogleAuthProvider,
    OAuthProvider,
    onAuthStateChanged,
    onIdTokenChanged,
    signInWithCredential,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
} from "firebase/auth";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { auth } from "../config/firebase";
import { getProfile } from "../api/profileApi";
import { unwrapApiData } from "../utils/api";
import * as authStorage from "../utils/authStorage";

const AuthContext = createContext(null);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchBackendProfile() {
    const envelope = await getProfile();
    return unwrapApiData(envelope, null);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    /** null = no error; string = error message (network, server, etc.) */
    const [profileError, setProfileError] = useState(null);
    /** true once the initial auth + profile bootstrap completes */
    const [ready, setReady] = useState(false);

    // ── Core profile loader ────────────────────────────────────────────────

    const loadProfileForUser = useCallback(async (firebaseUser) => {
        if (!firebaseUser) {
            setProfile(null);
            setProfileError(null);
            return;
        }

        setProfileError(null);

        try {
            // Ensure authStorage has the latest token before the API call.
            const token = await firebaseUser.getIdToken();
            await authStorage.setFirebaseToken(token);

            const p = await fetchBackendProfile();
            if (p == null || typeof p !== "object") {
                setProfile(null);
                setProfileError(
                    "Invalid profile response from server. Try again.",
                );
                return;
            }
            setProfile(p);
            setProfileError(null);
        } catch (err) {
            const httpStatus = err?.response?.status;

            if (httpStatus === 401) {
                // The backend still rejected the token even after the axios
                // retry interceptor force-refreshed it. Token is revoked or the
                // Firebase project is mis-configured — force sign-out so the
                // user is returned to the Login screen cleanly.
                if (__DEV__) {
                    console.warn("[Auth] Persistent 401 — force sign-out.");
                }
                await authStorage.clearFirebaseToken();
                await firebaseSignOut(auth);
                // onAuthStateChanged will fire with null; no need to set state here.
                return;
            }

            if (__DEV__) {
                console.warn(
                    "[Auth] GET /api/profile failed:",
                    err?.message ?? err,
                );
            }
            setProfile(null);
            setProfileError(err?.message ?? "Could not load profile.");
        }
    }, []);

    // ── Auth state listener ────────────────────────────────────────────────

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (nextUser) => {
            setUser(nextUser);

            if (!nextUser) {
                setProfile(null);
                setProfileError(null);
                await authStorage.clearFirebaseToken();
                setReady(true);
                return;
            }

            /**
             * After the first `null` auth event we set `ready: true` (Login).
             * When the user signs in, we must set `ready: false` again until
             * `GET /api/profile` finishes — otherwise AppNavigator shows
             * `user && ready && !profile` and renders an infinite loading spinner.
             */
            setReady(false);
            try {
                await loadProfileForUser(nextUser);
            } finally {
                setReady(true);
            }
        });

        return unsub;
    }, [loadProfileForUser]);

    // ── Keep AsyncStorage token fresh whenever Firebase rotates the JWT ───

    useEffect(() => {
        const unsub = onIdTokenChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                await authStorage.clearFirebaseToken();
                return;
            }
            try {
                const t = await firebaseUser.getIdToken();
                await authStorage.setFirebaseToken(t);
            } catch {
                /* non-fatal — client.js has its own retry on 401 */
            }
        });

        return unsub;
    }, []);

    // ── Actions ───────────────────────────────────────────────────────────

    /** Re-fetch backend profile (e.g. after onboarding save, or after a network error). */
    const refreshProfile = useCallback(async () => {
        const current = auth.currentUser;
        if (!current) {
            setProfile(null);
            setProfileError(null);
            return;
        }
        setProfileError(null);
        try {
            const p = await fetchBackendProfile();
            setProfile(p);
            setProfileError(null);
        } catch (err) {
            if (__DEV__) {
                console.warn("[Auth] refreshProfile failed:", err?.message ?? err);
            }
            setProfileError(err?.message ?? "Could not load profile.");
        }
    }, []);

    /** Re-run the full bootstrap (used by the network-error screen). */
    const retryProfileLoad = useCallback(async () => {
        const current = auth.currentUser;
        if (!current) return;
        await loadProfileForUser(current);
    }, [loadProfileForUser]);

    const signInWithEmail = useCallback(async (email, password) => {
        await signInWithEmailAndPassword(auth, email.trim(), password);
    }, []);

    const signUpWithEmail = useCallback(async (email, password) => {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
    }, []);

    const signInWithGoogleIdToken = useCallback(async (idToken) => {
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
    }, []);

    const signInWithApple = useCallback(async () => {
        const available = await AppleAuthentication.isAvailableAsync();
        if (!available) {
            throw new Error("Apple Sign-In is not available on this device.");
        }

        const rawNonce =
            Math.random().toString(36).slice(2) + Date.now().toString(36);
        const hashedNonce = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            rawNonce,
            { encoding: Crypto.CryptoEncoding.HEX },
        );

        const apple = await AppleAuthentication.signInAsync({
            requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
            nonce: hashedNonce,
        });

        if (!apple.identityToken) {
            throw new Error("Apple did not return an identity token.");
        }

        const provider = new OAuthProvider("apple.com");
        const credential = provider.credential({
            idToken: apple.identityToken,
            rawNonce,
        });
        await signInWithCredential(auth, credential);
    }, []);

    const clearAuth = useCallback(async () => {
        await authStorage.clearFirebaseToken();
        await firebaseSignOut(auth);
        setUser(null);
        setProfile(null);
        setProfileError(null);
    }, []);

    // ── Context value ─────────────────────────────────────────────────────

    const value = useMemo(
        () => ({
            /** Firebase user object (null when signed out) */
            user,
            /** Backend profile document (null when not loaded / new user) */
            profile,
            /** Non-null string when GET /api/profile failed for a non-auth reason */
            profileError,
            /** false while the initial auth + profile bootstrap is running */
            ready,
            refreshProfile,
            retryProfileLoad,
            signInWithEmail,
            signUpWithEmail,
            signInWithGoogleIdToken,
            signInWithApple,
            clearAuth,
        }),
        [
            user,
            profile,
            profileError,
            ready,
            refreshProfile,
            retryProfileLoad,
            signInWithEmail,
            signUpWithEmail,
            signInWithGoogleIdToken,
            signInWithApple,
            clearAuth,
        ],
    );

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return ctx;
}
