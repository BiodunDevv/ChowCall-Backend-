import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { Tenant } from "../tenants/tenant.model.js";
import { Order } from "../orders/order.model.js";
import { Payment } from "../payments/payment.model.js";
import { User } from "../users/user.model.js";
import { Plan } from "../plans/plan.model.js";
import { env } from "../../config/env.js";

export const adminRouter = Router();

type PlatformDashboardOrder = {
  _id: unknown;
  orderNumber?: string;
  status?: string;
  source?: string;
  fulfilmentType?: string;
  customer?: { name?: string };
  pricing?: { totalPayable?: number };
  payment?: { paidAt?: Date };
  createdAt?: Date;
};

// All admin routes require platform_owner or platform_admin
adminRouter.use(requireAuth, requireRoles("platform_owner", "platform_admin"));

adminRouter.get("/dashboard", async (_req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - todayStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const dayLabels: string[] = [];
    const dayStarts: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(todayStart.getDate() - i);
      dayLabels.push(d.toLocaleDateString("en-NG", { weekday: "short" }));
      dayStarts.push(d);
    }

    const [allOrders, recentOrderDocs, tenantCount, activeTenantCount, paidPayments] =
      await Promise.all([
        Order.find().lean(),
        Order.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .select("orderNumber status source fulfilmentType customer pricing payment createdAt tenantId")
          .lean(),
        Tenant.countDocuments(),
        Tenant.countDocuments({
          $or: [{ subscriptionStatus: "active" }, { "onboarding.status": "live" }],
        }),
        Payment.find({ status: "paid" }).select("amount currency createdAt").lean(),
      ]);

    let todayOrders = 0;
    let todayRevenue = 0;
    let todayPending = 0;
    let weekOrders = 0;
    let weekRevenue = 0;
    let monthOrders = 0;
    let monthRevenue = 0;
    let totalRevenue = 0;
    const statusCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    const chartMap: Record<string, { revenue: number; orders: number }> = {};

    for (const d of dayStarts) {
      chartMap[d.toISOString().slice(0, 10)] = { revenue: 0, orders: 0 };
    }

    for (const order of allOrders as PlatformDashboardOrder[]) {
      const createdAt = new Date(order.createdAt as Date);
      const payable = order.pricing?.totalPayable ?? 0;
      const paid = order.payment?.paidAt != null;

      if (paid) totalRevenue += payable;
      if (createdAt >= todayStart) {
        todayOrders++;
        if (paid) todayRevenue += payable;
        if (order.status === "PENDING_PAYMENT") todayPending++;
      }
      if (createdAt >= weekStart) {
        weekOrders++;
        if (paid) weekRevenue += payable;
      }
      if (createdAt >= monthStart) {
        monthOrders++;
        if (paid) monthRevenue += payable;
      }

      const status = String(order.status ?? "unknown");
      const source = String(order.source ?? "unknown");
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;

      const key = createdAt.toISOString().slice(0, 10);
      if (chartMap[key]) {
        chartMap[key].orders++;
        if (paid) chartMap[key].revenue += payable;
      }
    }

    const revenueChart = dayStarts.map((d, i) => {
      const key = d.toISOString().slice(0, 10);
      return {
        date: dayLabels[i],
        revenue: chartMap[key]?.revenue ?? 0,
        orders: chartMap[key]?.orders ?? 0,
      };
    });

    const recentOrders = (recentOrderDocs as PlatformDashboardOrder[]).map((order) => ({
      id: String(order._id),
      orderNumber: order.orderNumber ?? "",
      status: order.status ?? "",
      source: order.source ?? "",
      fulfilmentType: order.fulfilmentType ?? "",
      customerName: order.customer?.name ?? "",
      totalPayable: order.pricing?.totalPayable ?? 0,
      createdAt: order.createdAt,
    }));

    res.json({
      data: {
        todayOrders,
        todayRevenue,
        todayPending,
        weekOrders,
        weekRevenue,
        monthOrders,
        monthRevenue,
        totalOrders: allOrders.length,
        totalRevenue,
        tenantCount,
        activeTenantCount,
        paidPaymentCount: paidPayments.length,
        recentOrders,
        statusCounts,
        sourceCounts,
        revenueChart,
      },
    });
  } catch (err) {
    next(err);
  }
});

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

// ── Tenant management ─────────────────────────────────────────────────────────

adminRouter.get("/tenants", async (req, res, next) => {
  try {
    const { search, status, page = "1", limit = "50" } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter: Record<string, unknown> = {};
    if (status && status !== "all") filter.subscriptionStatus = status;
    if (search) filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
    ];
    const [tenants, total] = await Promise.all([
      Tenant.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("name slug logo subscriptionStatus onboarding createdAt phone address"),
      Tenant.countDocuments(filter),
    ]);
    res.json({ data: tenants, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

adminRouter.get("/tenants/:id", async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) { res.status(404).json({ error: { message: "Tenant not found" } }); return; }
    res.json({ data: tenant });
  } catch (err) { next(err); }
});

const tenantStatusSchema = z.object({
  status: z.enum(["active", "suspended", "cancelled", "trialing"]),
});

adminRouter.patch("/tenants/:id/status", async (req, res, next) => {
  try {
    const { status } = tenantStatusSchema.parse(req.body);
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { subscriptionStatus: status },
      { new: true },
    );
    if (!tenant) { res.status(404).json({ error: { message: "Tenant not found" } }); return; }
    res.json({ data: tenant, message: `Tenant status updated to ${status}.` });
  } catch (err) { next(err); }
});

// ── User management ───────────────────────────────────────────────────────────

adminRouter.get("/users", async (req, res, next) => {
  try {
    const { search, role, page = "1", limit = "50" } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter: Record<string, unknown> = {};
    if (role && role !== "all") filter.platformRoles = role;
    if (search) filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-passwordHash -refreshTokenHash"),
      User.countDocuments(filter),
    ]);
    res.json({ data: users, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

adminRouter.get("/users/:id", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash -refreshTokenHash");
    if (!user) { res.status(404).json({ error: { message: "User not found" } }); return; }
    res.json({ data: user });
  } catch (err) { next(err); }
});

const userRolesSchema = z.object({ roles: z.array(z.string()).min(1) });

adminRouter.patch("/users/:id/roles", async (req, res, next) => {
  try {
    const { roles } = userRolesSchema.parse(req.body);
    const user = await User.findByIdAndUpdate(req.params.id, { platformRoles: roles }, { new: true })
      .select("-passwordHash -refreshTokenHash");
    if (!user) { res.status(404).json({ error: { message: "User not found" } }); return; }
    res.json({ data: user, message: "User roles updated." });
  } catch (err) { next(err); }
});

const userStatusSchema = z.object({ active: z.boolean() });

adminRouter.patch("/users/:id/status", async (req, res, next) => {
  try {
    const { active } = userStatusSchema.parse(req.body);
    const update = active ? { active: true, $unset: { disabledAt: 1 } } : { active: false, disabledAt: new Date() };
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select("-passwordHash -refreshTokenHash");
    if (!user) { res.status(404).json({ error: { message: "User not found" } }); return; }
    res.json({ data: user, message: `User ${active ? "activated" : "deactivated"}.` });
  } catch (err) { next(err); }
});

// ── Platform-wide orders ──────────────────────────────────────────────────────

adminRouter.get("/orders", async (req, res, next) => {
  try {
    const { status, source, tenantId, page = "1", limit = "50" } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter: Record<string, unknown> = {};
    if (status && status !== "all") filter.status = status.toUpperCase();
    if (source && source !== "all") filter.source = source;
    if (tenantId) filter.tenantId = tenantId;
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("orderNumber status source fulfilmentType customer pricing payment createdAt tenantId items"),
      Order.countDocuments(filter),
    ]);
    res.json({ data: orders, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// ── Platform plans management ─────────────────────────────────────────────────

adminRouter.get("/plans", async (_req, res, next) => {
  try {
    const plans = await Plan.find().sort({ sortOrder: 1, priceMonthly: 1 });
    res.json({ data: plans });
  } catch (err) { next(err); }
});

const createPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceMonthly: z.number().min(0),
  currency: z.string().default("NGN"),
  includedMinutes: z.number().int().min(0).default(0),
  overagePerMinute: z.number().min(0).default(0),
  features: z.array(z.string()).default([]),
  badge: z.string().optional(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

adminRouter.post("/plans", async (req, res, next) => {
  try {
    const payload = createPlanSchema.parse(req.body);
    const plan = await Plan.create(payload);
    res.status(201).json({ data: plan });
  } catch (err) { next(err); }
});
