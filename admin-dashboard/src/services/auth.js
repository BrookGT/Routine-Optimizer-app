const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const SIGN_IN_URL = firebaseApiKey
  ? `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`
  : "";

const mapFirebaseError = (code) => {
  switch (code) {
    case "EMAIL_NOT_FOUND":
    case "INVALID_EMAIL":
      return "Email not found. Check the address and try again.";
    case "INVALID_PASSWORD":
      return "Incorrect password. Please try again.";
    case "USER_DISABLED":
      return "This account has been disabled.";
    case "MISSING_PASSWORD":
      return "Enter your password to continue.";
    default:
      return "Unable to sign in. Please try again.";
  }
};

export async function signInWithEmailPassword(email, password) {
  if (!firebaseApiKey) {
    throw new Error("Missing VITE_FIREBASE_API_KEY in admin dashboard environment");
  }

  const response = await fetch(SIGN_IN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const code = data?.error?.message;
    throw new Error(mapFirebaseError(code));
  }

  return data;
}

export async function verifyAdminToken(idToken) {
  const response = await fetch(`${apiBaseUrl}/admin/verify`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Admin access denied");
  }

  return data;
}
