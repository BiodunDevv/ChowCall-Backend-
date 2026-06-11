import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  tenantName: z.string().min(2),
  slug: z.string().trim().min(2).optional(),
  phone: z.string().optional(),
  twoFactorEnabled: z.boolean().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().trim().regex(/^\d{6}$/, "OTP code must be 6 digits"),
  loginToken: z.string().min(16).optional().nullable(),
});

export const securitySettingsSchema = z.object({
  twoFaEnabled: z.boolean(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
