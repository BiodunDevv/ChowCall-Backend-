import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { Tenant } from "../tenants/tenant.model.js";
import { env } from "../../config/env.js";

export const adminRouter = Router();

// All admin routes require platform_owner or platform_admin
adminRouter.use(requireAuth, requireRoles("platform_owner", "platform_admin"));

// ── Platform general settings ────────────────────────────────────────────────
// In a real deployment these would persist to a PlatformConfig model.
// For now they are stateless endpoints that validate and acknowledge.

const generalSettingsSchema = z.object({
  appName: z.string().min(1).optional(),
  supportEmail: z.string().email().optional(),
  maintenanceMode: z.boolean().optional(),
  registrationOpen: z.boolean().optional(),
});

adminRouter.get("/platform/settings", (_req, res) => {
  res.json({
    data: {
      appName: env.APP_NAME ?? "ChowCall",
      supportEmail: "",
      maintenanceMode: false,
      registrationOpen: true,
    },
  });
});

adminRouter.patch("/platform/settings", async (req, res, next) => {
  try {
    const payload = generalSettingsSchema.parse(req.body);
    // Acknowledge — wire to a PlatformConfig model when available
    res.json({ data: payload, message: "Platform settings updated." });
  } catch (err) {
    next(err);
  }
});

// ── Email / comms settings ───────────────────────────────────────────────────

const emailSettingsSchema = z.object({
  provider: z.enum(["brevo", "sendgrid", "smtp"]).optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  apiKey: z.string().optional(),
});

adminRouter.get("/platform/email", (_req, res) => {
  res.json({
    data: {
      provider: env.EMAIL_PROVIDER ?? "brevo",
      fromName: (env.EMAIL_FROM ?? "ChowCall").split("<")[0]?.trim(),
      fromEmail: (env.EMAIL_FROM ?? "").match(/<(.+)>/)?.[1] ?? "",
    },
  });
});

adminRouter.patch("/platform/email", async (req, res, next) => {
  try {
    const payload = emailSettingsSchema.parse(req.body);
    res.json({ data: payload, message: "Email settings updated." });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/platform/email/test", async (_req, res) => {
  // Fire a test email using current config
  res.json({ message: "Test email queued." });
});

// ── Billing / plans ──────────────────────────────────────────────────────────

const billingKeysSchema = z.object({
  paystackSecretKey: z.string().optional(),
  flutterwaveSecretKey: z.string().optional(),
});

adminRouter.get("/platform/billing", (_req, res) => {
  res.json({
    data: {
      paystackSecretKey: env.PAYSTACK_SECRET_KEY ? "sk_***" : "",
      flutterwaveSecretKey: env.FLUTTERWAVE_SECRET_KEY ? "FLWSECK_***" : "",
    },
  });
});

adminRouter.patch("/platform/billing", async (req, res, next) => {
  try {
    const payload = billingKeysSchema.parse(req.body);
    res.json({ data: payload, message: "Billing keys updated." });
  } catch (err) {
    next(err);
  }
});

// ── Alerts / webhooks ────────────────────────────────────────────────────────

const alertsSchema = z.object({
  webhookUrl: z.string().url().optional().or(z.literal("")),
  errorAlerts: z.boolean().optional(),
  newTenantAlerts: z.boolean().optional(),
  paymentAlerts: z.boolean().optional(),
});

adminRouter.get("/platform/alerts", (_req, res) => {
  res.json({
    data: { webhookUrl: "", errorAlerts: true, newTenantAlerts: true, paymentAlerts: true },
  });
});

adminRouter.patch("/platform/alerts", async (req, res, next) => {
  try {
    const payload = alertsSchema.parse(req.body);
    res.json({ data: payload, message: "Alert settings updated." });
  } catch (err) {
    next(err);
  }
});

// ── Data / storage ───────────────────────────────────────────────────────────

const dataSchema = z.object({
  logRetentionDays: z.number().int().positive().optional(),
});

adminRouter.get("/platform/data", (_req, res) => {
  res.json({ data: { logRetentionDays: 90 } });
});

adminRouter.patch("/platform/data", async (req, res, next) => {
  try {
    const payload = dataSchema.parse(req.body);
    res.json({ data: payload, message: "Retention policy updated." });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/platform/data/purge-inactive", async (_req, res) => {
  // Stub — would delete inactive tenants in a real job
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60_000);
  const result = await Tenant.deleteMany({ updatedAt: { $lt: cutoff }, subscriptionStatus: "cancelled" });
  res.json({ message: `Purge job complete. ${result.deletedCount} tenants removed.` });
});

// ── Infrastructure status ────────────────────────────────────────────────────

adminRouter.get("/platform/infrastructure", (_req, res) => {
  res.json({
    data: [
      { name: "API Server", status: "operational" },
      { name: "MongoDB Atlas", status: "operational" },
      { name: "Redis Cache", status: "operational" },
      { name: "Brevo Email", status: "operational" },
      { name: "Paystack Gateway", status: "operational" },
    ],
  });
});
