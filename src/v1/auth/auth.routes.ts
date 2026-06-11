import { Router } from "express";
import {
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  resetPassword,
  updateSecuritySettings,
  verifyOtp,
} from "./auth.controller.js";
import { requireAuth } from "../../shared/middleware/auth.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/verify-otp", verifyOtp);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", requireAuth, logout);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/security", requireAuth, updateSecuritySettings);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
