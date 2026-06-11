import { Router } from "express";
import { Tenant } from "../tenants/tenant.model.js";
import { MenuItem } from "../menu/menu-item.model.js";
import { AppError } from "../../shared/errors/app-error.js";
import { priceOrder } from "../orders/order-pricing.service.js";
import { Order } from "../orders/order.model.js";
import { getPaymentProvider } from "../../providers/payments/index.js";
import { Payment } from "../payments/payment.model.js";
import { createReference } from "../../shared/utils/reference.js";
import { env } from "../../config/env.js";
import type { DeliveryPricingConfig, ServiceFeeConfig } from "../pricing/pricing.types.js";

export const publicOrderingRouter = Router();

publicOrderingRouter.get("/:tenantSlug/menu", async (req, res, next) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.tenantSlug });
    if (!tenant) throw new AppError(404, "Tenant not found", "TENANT_NOT_FOUND");
    const items = await MenuItem.find({ tenantId: tenant._id, available: true });
    res.json({ tenant: { name: tenant.name, slug: tenant.slug }, data: items });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.post("/:tenantSlug/quote", async (req, res, next) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.tenantSlug }).lean();
    if (!tenant) throw new AppError(404, "Tenant not found", "TENANT_NOT_FOUND");

    const priced = priceOrder({
      fulfilmentType: req.body.fulfilmentType ?? "delivery",
      distanceKm: req.body.distanceKm,
      durationMinutes: req.body.durationMinutes,
      discount: req.body.discount ?? 0,
      items: req.body.items ?? [],
      deliveryPricing: tenant.deliveryPricing as unknown as DeliveryPricingConfig,
      serviceFee: tenant.serviceFee as unknown as ServiceFeeConfig,
    });
    res.json({
      data: {
        pricing: priced.pricing,
        items: priced.items,
        outOfZone: priced.outOfZone,
      },
    });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.post("/:tenantSlug/checkout", async (req, res, next) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.tenantSlug });
    if (!tenant) throw new AppError(404, "Tenant not found", "TENANT_NOT_FOUND");

    const priced = priceOrder({
      fulfilmentType: req.body.fulfilmentType ?? "delivery",
      distanceKm: req.body.distanceKm,
      durationMinutes: req.body.durationMinutes,
      discount: req.body.discount ?? 0,
      items: req.body.items ?? [],
      deliveryPricing: tenant.deliveryPricing as unknown as DeliveryPricingConfig,
      serviceFee: tenant.serviceFee as unknown as ServiceFeeConfig,
    });

    const order = await Order.create({
      tenantId: tenant.id,
      source: "web",
      status: tenant.payment?.payOnDeliveryEnabled ? "CONFIRMED" : "PENDING_PAYMENT",
      customer: req.body.customer,
      fulfilmentType: req.body.fulfilmentType ?? "delivery",
      items: priced.items,
      pricing: priced.pricing,
    });

    if (tenant.payment?.payOnDeliveryEnabled) {
      res.status(201).json({ data: { order, paymentRequired: false } });
      return;
    }

    const reference = createReference("CHOWCALL");
    const amount = order.pricing?.totalPayable ?? 0;
    const provider = getPaymentProvider(tenant.payment?.provider);
    const link = await provider.createPaymentLink({
      amount,
      email: req.body.customer?.email,
      phone: req.body.customer?.phone,
      reference,
      metadata: { orderId: order.id, tenantId: tenant.id, source: "public_ordering" },
    });

    const payment = await Payment.create({
      tenantId: tenant.id,
      orderId: order.id,
      provider: link.provider,
      reference: link.reference,
      amount,
      authorizationUrl: link.authorizationUrl,
    });

    order.payment = {
      provider: link.provider,
      reference: link.reference,
      authorizationUrl: link.authorizationUrl,
      expiresAt: new Date(Date.now() + env.PAYMENT_EXPIRY_MINUTES * 60_000),
    };
    await order.save();

    res.status(201).json({
      data: {
        order,
        payment,
        paymentRequired: true,
        authorizationUrl: link.authorizationUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});
