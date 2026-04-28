/**
 * middleware/auth.middleware.js — Firebase ID token verification
 *
 * Responsibility: validate the Authorization header on every protected route,
 * verify the token with Firebase Admin SDK, and attach the decoded payload to
 * req.user so downstream controllers have access to the caller's identity.
 *
 * Usage (in any route file):
 *   import { authenticate } from "../middleware/auth.middleware.js";
 *   router.get("/protected", authenticate, controller);
 */

import { auth } from "../config/firebase.js";

/**
 * Extracts and verifies a Firebase ID token from the Authorization header.
 *
 * Expected header format:
 *   Authorization: Bearer <firebase-id-token>
 *
 * On success:
 *   - req.user is populated with the decoded token payload
 *     (uid, email, name, email_verified, etc.)
 *   - next() is called to continue to the next middleware / controller
 *
 * On failure:
 *   - Returns 401 with a consistent { success: false, message } response
 *   - next() is NOT called — the request is terminated here
 *
 * @type {import("express").RequestHandler}
 */
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Reject if the header is missing or not in "Bearer <token>" format
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      data: null,
      message: "Unauthorized: missing or malformed Authorization header",
    });
  }

  // Extract the raw token (everything after "Bearer ")
  const token = authHeader.split(" ")[1];

  try {
    // Verify the token signature and expiry against Firebase Auth
    // Throws if the token is invalid, expired, or revoked
    const decodedToken = await auth.verifyIdToken(token);

    // Attach the full decoded payload so controllers can read uid, email, etc.
    req.user = decodedToken;

    next();
  } catch (error) {
    // Do not expose the internal Firebase error detail to the client
    return res.status(401).json({
      success: false,
      data: null,
      message: "Unauthorized: invalid or expired token",
    });
  }
};

const parseAdminEmails = () =>
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const hasAdminClaim = (user) =>
  user?.admin === true ||
  user?.role === "admin" ||
  user?.claims?.admin === true;

/**
 * Ensures the authenticated user is an admin.
 * Admins are determined by Firebase custom claims or ADMIN_EMAILS.
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      data: null,
      message: "Unauthorized: missing authentication",
    });
  }

  const adminEmails = parseAdminEmails();
  const email = req.user.email?.toLowerCase();

  if (hasAdminClaim(req.user) || (email && adminEmails.includes(email))) {
    return next();
  }

  return res.status(403).json({
    success: false,
    data: null,
    message: "Forbidden: admin access required",
  });
};
