import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { calculateDeliveryFee } from "../pricing/delivery-fee.engine.js";
import type { DeliveryPricingConfig } from "../pricing/pricing.types.js";
import { Tenant } from "../tenants/tenant.model.js";

const freeDeliverySchema = z.object({
  enabled: z.boolean().default(false),
  minimumOrderSubtotal: z.number().nonnegative().optional(),
  maxDistanceKm: z.number().nonnegative().optional(),
});

const zoneOverrideSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  fee: z.number().nonnegative(),
});

const surgeRuleSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(false),
  multiplier: z.number().min(1).max(5).default(1),
});

const updateDeliveryPricingSchema = z.object({
  mode: z.enum(["distance", "zone"]).optional(),
  baseFee: z.number().nonnegative().optional(),
  perKmRate: z.number().nonnegative().optional(),
  minimumDeliveryFee: z.number().nonnegative().optional(),
  maximumDeliveryFee: z.number().nonnegative().optional(),
  maxDeliveryRadiusKm: z.number().nonnegative().optional(),
  roundingRule: z.enum(["none", "nearest_50", "nearest_100", "up_100"]).optional(),
  freeDelivery: freeDeliverySchema.optional(),
  surgeRules: z.array(surgeRuleSchema).optional(),
  zoneOverrides: z.array(zoneOverrideSchema).optional(),
  outOfZoneBehavior: z.enum(["reject", "live_confirm", "allow"]).optional(),
});

const previewSchema = z.object({
  fulfilmentType: z.enum(["pickup", "delivery"]).default("delivery"),
  distanceKm: z.number().nonnegative().optional(),
  itemSubtotal: z.number().nonnegative(),
  zoneName: z.string().optional(),
});

export const deliveryPricingRouter = Router();

deliveryPricingRouter.use(requireAuth, requireTenant);

deliveryPricingRouter.get("/", async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select("deliveryPricing").lean();
  res.json({ data: tenant?.deliveryPricing ?? null });
});

deliveryPricingRouter.patch(
  "/",
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res) => {
    const payload = updateDeliveryPricingSchema.parse(req.body);
    const tenant = await Tenant.findByIdAndUpdate(
      req.user!.tenantId,
      { $set: { deliveryPricing: payload } },
      { new: true, runValidators: true }
    ).select("deliveryPricing");

    res.json({ data: tenant?.deliveryPricing ?? null });
  }
);

deliveryPricingRouter.post("/preview", async (req, res) => {
  const input = previewSchema.parse(req.body);
  const tenant = await Tenant.findById(req.user!.tenantId).select("deliveryPricing").lean();
  const config = tenant?.deliveryPricing as DeliveryPricingConfig & {
    surgeRules?: Array<{ enabled?: boolean; multiplier?: number }>;
    zoneOverrides?: Array<{ name?: string; aliases?: string[]; fee?: number }>;
  };
  const zoneOverride = input.zoneName
    ? config?.zoneOverrides?.find((zone: { name?: string; aliases?: string[] }) => {
        const search = input.zoneName!.toLowerCase();
        return (
          zone.name?.toLowerCase() === search ||
          zone.aliases?.some((alias) => alias.toLowerCase() === search)
        );
      })
    : undefined;

  const result = calculateDeliveryFee({
    fulfilmentType: input.fulfilmentType,
    distanceKm: input.distanceKm,
    itemSubtotal: input.itemSubtotal,
    config: {
      ...config,
      zoneOverrideFee: zoneOverride?.fee,
      surgeMultiplier: config.surgeRules?.find((rule) => rule.enabled)?.multiplier,
    },
  });

  res.json({ data: { ...result, zoneOverrideApplied: zoneOverride?.name ?? null } });
});
