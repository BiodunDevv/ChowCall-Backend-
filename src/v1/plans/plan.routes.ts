import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { validate } from "../../shared/validation/validate.js";
import { Plan } from "./plan.model.js";

const updatePlanBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    priceMonthly: z.number().min(0).optional(),
    currency: z.enum(["NGN", "USD", "EUR", "GBP"]).optional(),
    includedMinutes: z.number().int().min(0).optional(),
    overagePerMinute: z.number().min(0).optional(),
    features: z.array(z.string().trim().min(1)).optional(),
    badge: z.string().trim().nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
  })
  .strict();

const updatePlanParamsSchema = z.object({
  id: z.string().min(1),
});

export const planRouter = Router();

planRouter.get("/", async (_req, res) => {
  const plans = await Plan.find({ active: true }).sort({ sortOrder: 1, priceMonthly: 1 });
  res.json({ data: plans });
});

planRouter.patch(
  "/:id",
  requireAuth,
  requireRoles("platform_owner", "platform_admin"),
  validate({ body: updatePlanBodySchema, params: updatePlanParamsSchema }),
  async (req, res) => {
    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.json({ data: plan });
  }
);
