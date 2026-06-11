import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { Tenant } from "../tenants/tenant.model.js";
import { UsageEvent } from "./usage-event.model.js";

const usageEventSchema = z.object({
  type: z.enum(["call_minute", "sms", "order", "payment", "ai_token"]),
  quantity: z.number().positive().default(1),
  metadata: z.record(z.unknown()).optional(),
});

export const billingRouter = Router();

billingRouter.use(requireAuth, requireTenant);

billingRouter.get("/", async (req, res) => {
  const [tenant, usage] = await Promise.all([
    Tenant.findById(req.user!.tenantId).select("billingPlan").lean(),
    UsageEvent.aggregate([
      { $match: { tenantId: req.user!.tenantId } },
      { $group: { _id: "$type", quantity: { $sum: "$quantity" }, events: { $sum: 1 } } },
    ]),
  ]);

  res.json({ data: { plan: tenant?.billingPlan ?? "starter", usage } });
});

billingRouter.post(
  "/usage-events",
  requireRoles("platform_owner", "platform_admin", "tenant_owner", "tenant_admin"),
  async (req, res) => {
    const payload = usageEventSchema.parse(req.body);
    const event = await UsageEvent.create({
      ...payload,
      tenantId: req.user!.tenantId,
      createdBy: req.user!.id,
    });

    res.status(201).json({ data: event });
  }
);
