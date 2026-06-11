import { Router } from "express";
import { z } from "zod";
import { Tenant } from "./tenant.model.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";

export const tenantRouter = Router();

// ── Public ────────────────────────────────────────────────────────────────────

tenantRouter.get("/by-slug/:slug", async (req, res) => {
  const tenant = await Tenant.findOne({ slug: req.params.slug }).select(
    "name slug logo subscriptionStatus phone address openingHours",
  );
  if (!tenant) {
    res.status(404).json({ error: { code: "TENANT_NOT_FOUND", message: "Tenant not found" } });
    return;
  }
  res.json({ data: tenant });
});

// ── Auth required ─────────────────────────────────────────────────────────────

tenantRouter.use(requireAuth);

tenantRouter.get("/", requireRoles("platform_owner", "platform_admin"), async (_req, res) => {
  res.json({ data: await Tenant.find().sort({ createdAt: -1 }).limit(100) });
});

tenantRouter.get("/current", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId);
  res.json({ data: tenant });
});

tenantRouter.patch(
  "/current",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res) => {
    const tenant = await Tenant.findByIdAndUpdate(req.user!.tenantId, req.body, {
      new: true,
      runValidators: true,
    });
    res.json({ data: tenant });
  },
);

// ── Opening hours ─────────────────────────────────────────────────────────────

const dayScheduleSchema = z.object({
  open: z.boolean(),
  from: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  to: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const hoursSchema = z.object({
  schedule: z.record(z.string(), dayScheduleSchema),
});

tenantRouter.get("/current/hours", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select("openingHours").lean();
  res.json({ data: tenant?.openingHours ?? {} });
});

tenantRouter.patch(
  "/current/hours",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res, next) => {
    try {
      const { schedule } = hoursSchema.parse(req.body);
      const tenant = await Tenant.findByIdAndUpdate(
        req.user!.tenantId,
        { openingHours: schedule },
        { new: true },
      ).select("openingHours");
      res.json({ data: tenant?.openingHours ?? {} });
    } catch (err) {
      next(err);
    }
  },
);

// ── Phone / voice routing ─────────────────────────────────────────────────────

const phoneSchema = z.object({
  routingNumber: z.string().min(1),
  welcomeMessage: z.string().optional(),
});

tenantRouter.get("/current/phone", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select("voice").lean();
  res.json({ data: tenant?.voice ?? {} });
});

tenantRouter.patch(
  "/current/phone",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res, next) => {
    try {
      const payload = phoneSchema.parse(req.body);
      const tenant = await Tenant.findByIdAndUpdate(
        req.user!.tenantId,
        {
          "voice.routingNumber": payload.routingNumber,
          ...(payload.welcomeMessage !== undefined && { "voice.greeting": payload.welcomeMessage }),
        },
        { new: true },
      ).select("voice");
      res.json({ data: tenant?.voice ?? {} });
    } catch (err) {
      next(err);
    }
  },
);

// ── Payment provider ──────────────────────────────────────────────────────────

const paymentSchema = z.object({
  provider: z.enum(["paystack", "flutterwave", "cash"]),
  payOnDeliveryEnabled: z.boolean().optional(),
});

tenantRouter.get("/current/payment", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select("payment").lean();
  res.json({ data: tenant?.payment ?? {} });
});

tenantRouter.patch(
  "/current/payment",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res, next) => {
    try {
      const payload = paymentSchema.parse(req.body);
      const updateFields: Record<string, unknown> = {
        "payment.provider": payload.provider === "cash" ? "paystack" : payload.provider,
        "payment.payOnDeliveryEnabled": payload.provider === "cash" ? true : (payload.payOnDeliveryEnabled ?? false),
      };
      const tenant = await Tenant.findByIdAndUpdate(
        req.user!.tenantId,
        updateFields,
        { new: true },
      ).select("payment");
      res.json({ data: tenant?.payment ?? {} });
    } catch (err) {
      next(err);
    }
  },
);

// ── AI agent config ───────────────────────────────────────────────────────────

const aiAgentSchema = z.object({
  enabled: z.boolean(),
  instructions: z.string().optional(),
});

tenantRouter.get("/current/ai-agent", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId)
    .select("aiAgent")
    .lean() as { aiAgent?: unknown } | null;
  res.json({ data: (tenant as Record<string, unknown>)?.aiAgent ?? { enabled: false } });
});

tenantRouter.patch(
  "/current/ai-agent",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res, next) => {
    try {
      const payload = aiAgentSchema.parse(req.body);
      const tenant = await Tenant.findByIdAndUpdate(
        req.user!.tenantId,
        { aiAgent: payload },
        { new: true },
      ).select("aiAgent");
      res.json({ data: (tenant as unknown as Record<string, unknown>)?.aiAgent ?? {} });
    } catch (err) {
      next(err);
    }
  },
);
