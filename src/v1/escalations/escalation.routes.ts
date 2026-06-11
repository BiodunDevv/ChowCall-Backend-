import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { tenantQuery } from "../../shared/utils/tenant-query.js";
import { Escalation } from "./escalation.model.js";

const createEscalationSchema = z.object({
  orderId: z.string().optional(),
  callSessionId: z.string().optional(),
  reason: z.string().min(3),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  prompt: z.string().optional(),
  timeoutSeconds: z.number().int().positive().default(120),
});

const resolveEscalationSchema = z.object({
  resolution: z.string().min(2),
  decision: z.enum(["approved", "rejected", "needs_followup"]).default("approved"),
});

export const escalationRouter = Router();

escalationRouter.use(requireAuth, requireTenant);

escalationRouter.get("/", async (req, res) => {
  const escalations = await Escalation.find(tenantQuery(req.user!.tenantId!))
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({ data: escalations });
});

escalationRouter.post("/", async (req, res) => {
  const payload = createEscalationSchema.parse(req.body);
  const escalation = await Escalation.create({
    ...payload,
    tenantId: req.user!.tenantId,
    createdBy: req.user!.id,
    status: "pending",
    expiresAt: new Date(Date.now() + payload.timeoutSeconds * 1000),
  });

  res.status(201).json({ data: escalation });
});

escalationRouter.patch(
  "/:id/resolve",
  requireRoles("tenant_owner", "tenant_admin", "manager", "support_agent"),
  async (req, res) => {
    const payload = resolveEscalationSchema.parse(req.body);
    const escalation = await Escalation.findOneAndUpdate(
      tenantQuery(req.user!.tenantId!, { _id: req.params.id }),
      {
        $set: {
          status: "resolved",
          resolution: payload.resolution,
          decision: payload.decision,
          resolvedBy: req.user!.id,
          resolvedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );

    res.json({ data: escalation });
  }
);
