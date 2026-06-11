import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { tenantQuery } from "../../shared/utils/tenant-query.js";
import { Tenant } from "../tenants/tenant.model.js";
import { Order } from "./order.model.js";
import { priceOrder } from "./order-pricing.service.js";
import type { DeliveryPricingConfig, ServiceFeeConfig } from "../pricing/pricing.types.js";

const orderItemSchema = z.object({
  menuItemId: z.string().optional(),
  name: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative(),
  variants: z.array(z.object({ name: z.string().optional(), option: z.string().optional(), price: z.number().optional() })).default([]),
  addons: z.array(z.object({ name: z.string().optional(), price: z.number().optional(), quantity: z.number().optional() })).default([]),
  notes: z.string().optional(),
});

const createOrderSchema = z.object({
  source: z.enum(["voice", "web", "dashboard", "whatsapp"]).default("dashboard"),
  customer: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    landmark: z.string().optional(),
    mapLink: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  fulfilmentType: z.enum(["pickup", "delivery"]).default("delivery"),
  distanceKm: z.number().nonnegative().optional(),
  durationMinutes: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().default(0),
  items: z.array(orderItemSchema).min(1),
});

export const orderRouter = Router();

orderRouter.use(requireAuth, requireTenant);

orderRouter.get("/", async (req, res) => {
  res.json({ data: await Order.find(tenantQuery(req.user!.tenantId!)).sort({ createdAt: -1 }).limit(100) });
});

orderRouter.post("/", async (req, res) => {
  const payload = createOrderSchema.parse(req.body);
  const tenant = await Tenant.findById(req.user!.tenantId).select("deliveryPricing serviceFee").lean();
  const priced = priceOrder({
    fulfilmentType: payload.fulfilmentType,
    distanceKm: payload.distanceKm,
    durationMinutes: payload.durationMinutes,
    discount: payload.discount,
    items: payload.items,
    deliveryPricing: tenant!.deliveryPricing as unknown as DeliveryPricingConfig,
    serviceFee: tenant!.serviceFee as unknown as ServiceFeeConfig,
  });
  const order = await Order.create({
    source: payload.source,
    customer: payload.customer,
    fulfilmentType: payload.fulfilmentType,
    items: priced.items,
    pricing: priced.pricing,
    status: "PRICED",
    tenantId: req.user!.tenantId,
    createdBy: req.user!.id,
  });
  res.status(201).json({ data: order });
});

orderRouter.get("/:id", async (req, res) => {
  res.json({ data: await Order.findOne(tenantQuery(req.user!.tenantId!, { _id: req.params.id })) });
});

orderRouter.patch("/:id/status", async (req, res) => {
  const order = await Order.findOneAndUpdate(
    tenantQuery(req.user!.tenantId!, { _id: req.params.id }),
    { status: req.body.status },
    { new: true }
  );
  res.json({ data: order });
});
