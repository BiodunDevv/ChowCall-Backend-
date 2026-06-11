import type { RequestHandler } from "express";
import { Tenant } from "../tenants/tenant.model.js";
import { User } from "../users/user.model.js";
import { AppError } from "../../shared/errors/app-error.js";
import { comparePassword, hashPassword } from "../../shared/security/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../shared/security/jwt.js";
import { loginSchema, registerSchema, reservedTenantSlugs, securitySettingsSchema, verifyOtpSchema } from "./auth.schemas.js";
import type { Role } from "../../shared/constants/roles.js";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { env } from "../../config/env.js";
import { brevoEmailProvider } from "../../providers/email/brevo-email.provider.js";
import {
  loginOtpEmail,
  passwordResetEmail,
  welcomeTenantEmail,
} from "../../providers/email/templates/auth.templates.js";

function issueTokens(user: { id: string; tenantId?: string; roles: Role[] }) {
  const payload = { sub: user.id, tenantId: user.tenantId, roles: user.roles };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  if (env.BREVO_API_KEY) {
    await brevoEmailProvider.send(input);
  } else if (env.NODE_ENV !== "production") {
    console.info(`[email] would send "${input.subject}" to ${input.to}`);
  } else {
    throw new AppError(500, "Email provider is not configured", "EMAIL_PROVIDER_NOT_CONFIGURED");
  }
}

export const register: RequestHandler = async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const existing = await User.findOne({ email: input.email.toLowerCase() });
    if (existing) throw new AppError(409, "Email is already registered", "EMAIL_EXISTS");

    const tenant = await Tenant.create({
      name: input.tenantName,
      slug: await uniqueTenantSlug(input.slug ?? input.tenantName),
      phone: input.phone,
    });

    const passwordHash = await hashPassword(input.password);
    const user = await User.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      memberships: [{ tenantId: tenant._id, roles: ["tenant_owner", "tenant_admin"] }],
    });

    const tokens = issueTokens({
      id: user.id,
      tenantId: tenant.id,
      roles: ["tenant_owner", "tenant_admin"],
    });
    user.refreshTokenHash = hashToken(tokens.refreshToken);
    await user.save();
    setAuthCookies(res, tokens);

    // Fire-and-forget welcome email — don't block the response
    const firstName = input.name.split(" ")[0] ?? input.name;
    const dashboardUrl = `${env.FRONTEND_BASE_URL}/${tenant.slug}/onboarding`;
    sendEmail({
      to: user.email,
      subject: `Welcome to ChowCall, ${firstName}!`,
      html: welcomeTenantEmail({
        name: input.name,
        tenantName: input.tenantName,
        dashboardUrl,
      }),
      text: `Welcome to ChowCall, ${firstName}! Your workspace "${input.tenantName}" is ready. Visit ${dashboardUrl} to complete your setup.`,
    }).catch((err) => console.error("[email] welcome email failed:", err));

    res.status(201).json({
      user: toAuthUser(user, ["tenant_owner", "tenant_admin"], tenant),
      tenant,
      tokens,
    });
  } catch (error) {
    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() });
    if (!user || !(await comparePassword(input.password, user.passwordHash))) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    const membership = user.memberships.find((item) => item.active);
    const roles = (membership?.roles?.length ? membership.roles : user.platformRoles) as Role[];
    const tenant = membership?.tenantId ? await Tenant.findById(membership.tenantId) : null;

    if (user.twoFaEnabled !== false) {
      const challenge = await createLoginOtpChallenge(user, roles, tenant);
      res.json({
        requiresOtp: true,
        twoFactorRequired: true,
        loginToken: challenge.loginToken,
        user: toAuthUser(user, roles, tenant),
        tenant,
      });
      return;
    }

    const tokens = issueTokens({ id: user.id, tenantId: membership?.tenantId?.toString(), roles });
    user.refreshTokenHash = hashToken(tokens.refreshToken);
    await user.save();
    setAuthCookies(res, tokens);

    res.json({ user: toAuthUser(user, roles, tenant), tenant, tokens });
  } catch (error) {
    next(error);
  }
};

export const verifyOtp: RequestHandler = async (req, res, next) => {
  try {
    const input = verifyOtpSchema.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() });
    if (
      !user ||
      !user.loginOtpHash ||
      !user.loginOtpTokenHash ||
      !user.loginOtpExpiresAt ||
      user.loginOtpExpiresAt.getTime() < Date.now() ||
      user.loginOtpHash !== hashToken(input.code) ||
      user.loginOtpTokenHash !== hashToken(input.loginToken ?? "")
    ) {
      throw new AppError(401, "Invalid or expired verification code", "INVALID_OTP");
    }

    const membership = user.memberships.find((item) => item.active);
    const roles = (membership?.roles?.length ? membership.roles : user.platformRoles) as Role[];
    const tenant = membership?.tenantId ? await Tenant.findById(membership.tenantId) : null;
    const tokens = issueTokens({ id: user.id, tenantId: membership?.tenantId?.toString(), roles });

    user.refreshTokenHash = hashToken(tokens.refreshToken);
    user.loginOtpHash = undefined;
    user.loginOtpTokenHash = undefined;
    user.loginOtpExpiresAt = undefined;
    await user.save();
    setAuthCookies(res, tokens);

    res.json({ user: toAuthUser(user, roles, tenant), tenant, tokens });
  } catch (error) {
    next(error);
  }
};

export const me: RequestHandler = async (req, res) => {
  const user = await User.findById(req.user!.id).select("-passwordHash -refreshTokenHash");
  const tenant = req.user?.tenantId ? await Tenant.findById(req.user.tenantId) : null;
  res.json({ user: user ? toAuthUser(user, req.user?.roles ?? [], tenant) : null, tenant });
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const token = parseCookie(req.header("cookie") ?? "").chowcall_refresh ?? req.body?.refreshToken;
    if (!token) throw new AppError(401, "Refresh token is required", "REFRESH_TOKEN_REQUIRED");
    const payload = verifyRefreshToken(token);
    const user = await User.findById(payload.sub);
    if (!user?.refreshTokenHash || user.refreshTokenHash !== hashToken(token)) {
      throw new AppError(401, "Refresh token is invalid", "INVALID_REFRESH_TOKEN");
    }
    const tokens = issueTokens({ id: payload.sub, tenantId: payload.tenantId, roles: payload.roles });
    user.refreshTokenHash = hashToken(tokens.refreshToken);
    await user.save();
    setAuthCookies(res, tokens);
    res.json({ tokens });
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = async (req, res) => {
  await User.findByIdAndUpdate(req.user!.id, { $unset: { refreshTokenHash: 1 } });
  clearAuthCookies(res);
  res.status(204).send();
};

export const updateProfile: RequestHandler = async (req, res, next) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) throw new AppError(400, "Name is required", "NAME_REQUIRED");
    const user = await User.findByIdAndUpdate(
      req.user!.id,
      { name: name.trim() },
      { new: true }
    ).select("-passwordHash -refreshTokenHash");
    const tenant = req.user?.tenantId ? await Tenant.findById(req.user.tenantId) : null;
    res.json({ user: user ? toAuthUser(user, req.user?.roles ?? [], tenant) : null });
  } catch (error) {
    next(error);
  }
};

export const changePassword: RequestHandler = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword) {
      throw new AppError(400, "Current and new password are required", "MISSING_FIELDS");
    }
    if (newPassword.length < 8) {
      throw new AppError(400, "Password must be at least 8 characters", "PASSWORD_TOO_SHORT");
    }
    const user = await User.findById(req.user!.id);
    if (!user) throw new AppError(404, "User not found", "USER_NOT_FOUND");
    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) throw new AppError(401, "Current password is incorrect", "INVALID_PASSWORD");

    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    res.json({ message: "Password updated successfully." });
  } catch (error) {
    next(error);
  }
};

export const updateSecuritySettings: RequestHandler = async (req, res, next) => {
  try {
    const input = securitySettingsSchema.parse(req.body);
    const user = await User.findByIdAndUpdate(
      req.user!.id,
      { twoFaEnabled: input.twoFaEnabled },
      { new: true }
    ).select("-passwordHash -refreshTokenHash");
    const tenant = req.user?.tenantId ? await Tenant.findById(req.user.tenantId) : null;
    res.json({ user: user ? toAuthUser(user, req.user?.roles ?? [], tenant) : null, tenant });
  } catch (error) {
    next(error);
  }
};

// ── Forgot password ──────────────────────────────────────────────────────────

export const forgotPassword: RequestHandler = async (req, res, next) => {
  try {
    const email = (req.body?.email ?? "").trim().toLowerCase();
    if (!email) throw new AppError(400, "Email is required", "EMAIL_REQUIRED");

    // Always respond 200 to prevent user enumeration — never reveal if email exists
    const user = await User.findOne({ email });
    if (user) {
      const token = randomBytes(32).toString("hex");
      user.passwordResetTokenHash = hashToken(token);
      user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60_000); // 1 hour
      await user.save();

      const resetUrl = `${env.FRONTEND_BASE_URL}/auth/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

      await sendEmail({
        to: user.email,
        subject: "Reset your ChowCall password",
        html: passwordResetEmail({ name: user.name, resetUrl }),
        text: `Reset your ChowCall password here: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
      });
    }

    res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (error) {
    next(error);
  }
};

export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    const { email, token, password } = req.body as {
      email?: string;
      token?: string;
      password?: string;
      confirmPassword?: string;
    };

    if (!email || !token || !password) {
      throw new AppError(400, "Email, token, and new password are required", "MISSING_FIELDS");
    }
    if (password.length < 8) {
      throw new AppError(400, "Password must be at least 8 characters", "PASSWORD_TOO_SHORT");
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (
      !user ||
      !user.passwordResetTokenHash ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now() ||
      user.passwordResetTokenHash !== hashToken(token)
    ) {
      throw new AppError(400, "Reset link is invalid or has expired", "INVALID_RESET_TOKEN");
    }

    user.passwordHash = await hashPassword(password);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    // Invalidate all existing sessions
    user.refreshTokenHash = undefined;
    await user.save();
    clearAuthCookies(res);

    res.json({ message: "Password updated. You can now sign in with your new password." });
  } catch (error) {
    next(error);
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function createLoginOtpChallenge(
  user: {
    id?: string;
    name: string;
    email: string;
    loginOtpHash?: string | null;
    loginOtpTokenHash?: string | null;
    loginOtpExpiresAt?: Date | null;
    save: () => Promise<unknown>;
  },
  roles: Role[],
  tenant: { name: string } | null
) {
  const code = String(randomInt(100000, 1000000));
  const loginToken = randomBytes(32).toString("hex");
  user.loginOtpHash = hashToken(code);
  user.loginOtpTokenHash = hashToken(loginToken);
  user.loginOtpExpiresAt = new Date(Date.now() + 10 * 60_000);
  await user.save();

  await sendEmail({
    to: user.email,
    subject: "Your ChowCall sign-in code",
    html: loginOtpEmail({
      name: user.name,
      code,
      tenantName: tenant?.name,
      role: roles[0],
    }),
    text: `Your ChowCall sign-in code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
  });

  return { loginToken };
}

function setAuthCookies(
  res: Parameters<RequestHandler>[1],
  tokens: { accessToken: string; refreshToken: string }
) {
  const secure = env.NODE_ENV === "production";
  res.cookie("chowcall_access", tokens.accessToken, {
    httpOnly: true, secure, sameSite: "lax", maxAge: 15 * 60_000, path: "/",
  });
  res.cookie("chowcall_refresh", tokens.refreshToken, {
    httpOnly: true, secure, sameSite: "lax", maxAge: 30 * 24 * 60 * 60_000, path: "/v1/auth",
  });
}

function clearAuthCookies(res: Parameters<RequestHandler>[1]) {
  res.clearCookie("chowcall_access", { path: "/" });
  res.clearCookie("chowcall_refresh", { path: "/v1/auth" });
}

function parseCookie(header: string) {
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, decodeURIComponent(value.join("="))];
    })
  );
}

async function uniqueTenantSlug(name: string) {
  const base =
    name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "restaurant";
  if (reservedTenantSlugs.has(base)) {
    throw new AppError(400, "This tenant URL is reserved", "RESERVED_TENANT_SLUG");
  }
  let slug = base;
  let suffix = 1;
  while (await Tenant.exists({ slug })) slug = `${base}-${suffix++}`;
  return slug;
}

function toAuthUser(
  user: { id?: string; _id?: unknown; name: string; email: string; twoFaEnabled?: boolean },
  roles: Role[],
  tenant: {
    id?: string;
    _id?: unknown;
    name: string;
    slug: string;
    onboarding?: { status?: string | null } | null;
    subscriptionStatus?: string | null;
  } | null
) {
  return {
    id: user.id ?? String(user._id ?? ""),
    name: user.name,
    email: user.email,
    twoFaEnabled: user.twoFaEnabled ?? true,
    role: roles[0] ?? null,
    roles,
    tenant: tenant
      ? {
          id: tenant.id ?? String(tenant._id ?? ""),
          name: tenant.name,
          slug: tenant.slug,
          logoUrl: (tenant as unknown as Record<string, unknown>).logo ?? null,
          onboardingStatus: tenant.onboarding?.status ?? null,
          subscriptionStatus: tenant.subscriptionStatus ?? null,
        }
      : null,
    tenantSlug: tenant?.slug ?? null,
  };
}
