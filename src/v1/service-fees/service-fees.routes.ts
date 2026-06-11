import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { calculateServiceFee } from "../pricing/service-fee.engine.js";
import type { ServiceFeeConfig } from "../pricing/pricing.types.js";
import { Tenant } from "../tenants/tenant.model.js";

const updateServiceFeeSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["percentage", "flat", "hybrid"]).optional(),
  percentage: z.number().min(0).max(100).optional(),
  flatFee: z.number().nonnegative().optional(),
  minimumFee: z.number().nonnegative().optional(),
  maximumFee: z.number().nonnegative().optional(),
  smallOrderFee: z
    .object({
      enabled: z.boolean(),
      threshold: z.number().nonnegative(),
      fee: z.number().nonnegative(),
    })
    .optional(),
  packagingFee: z
    .object({
      enabled: z.boolean(),
      feePerItem: z.number().nonnegative().optional(),
    })
    .optional(),
  appliesTo: z.enum(["pickup", "delivery", "both"]).optional(),
});

const previewSchema = z.object({
  itemSubtotal: z.number().nonnegative(),
  itemCount: z.number().int().positive(),
});

export const serviceFeesRouter = Router();

serviceFeesRouter.use(requireAuth, requireTenant);

serviceFeesRouter.get("/", async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select("serviceFee").lean();
  res.json({ data: tenant?.serviceFee ?? null });
});

serviceFeesRouter.patch(
  "/",
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res) => {
    const payload = updateServiceFeeSchema.parse(req.body);
    const tenant = await Tenant.findByIdAndUpdate(
      req.user!.tenantId,
      { $set: { serviceFee: payload } },
      { new: true, runValidators: true }
    ).select("serviceFee");

    res.json({ data: tenant?.serviceFee ?? null });
  }
);

serviceFeesRouter.post("/preview", async (req, res) => {
  const input = previewSchema.parse(req.body);
  const tenant = await Tenant.findById(req.user!.tenantId).select("serviceFee").lean();
  const config = tenant?.serviceFee as ServiceFeeConfig;
  const serviceFee = calculateServiceFee({
    itemSubtotal: input.itemSubtotal,
    itemCount: input.itemCount,
    config,
  });

  res.json({ data: { serviceFee } });
});
