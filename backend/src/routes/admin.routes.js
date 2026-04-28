/**
 * admin.routes.js — Admin-only verification route.
 */

import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// GET /api/admin/verify — confirms admin access.
router.get("/verify", authenticate, requireAdmin, (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      uid: req.user.uid,
      email: req.user.email ?? null,
    },
    message: "Admin verified",
  });
});

export default router;
