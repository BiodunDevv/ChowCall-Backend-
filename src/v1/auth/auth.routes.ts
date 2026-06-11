import { Router } from "express";
import {
  changePassword,
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  resetPassword,
  updateProfile,
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
authRouter.patch("/me", requireAuth, updateProfile);
authRouter.post("/change-password", requireAuth, changePassword);
authRouter.patch("/security", requireAuth, updateSecuritySettings);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
