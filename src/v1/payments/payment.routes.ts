/**
 * WEBHOOK SETUP GUIDE
 * ===================
 *
 * PAYSTACK:
 * 1. Go to https://dashboard.paystack.com → Settings → API Keys & Webhooks
 * 2. Under "Webhook URL", set: https://yourbackend.com/v1/payments/webhooks/paystack
 * 3. The "Secret Key" shown in "Test Secret Key" / "Live Secret Key" → set as PAYSTACK_SECRET_KEY
 * 4. The webhook signature secret is THE SAME as your secret key.
 *    Paystack signs webhooks using HMAC-SHA512 with your secret key.
 * 5. So set:  PAYSTACK_WEBHOOK_SECRET = (same value as PAYSTACK_SECRET_KEY)
 *
 * FLUTTERWAVE:
 * 1. Go to https://dashboard.flutterwave.com → Settings → Webhooks
 * 2. Add webhook URL: https://yourbackend.com/v1/payments/webhooks/flutterwave
 * 3. Flutterwave generates a separate webhook hash (secret) that you set in the dashboard.
 * 4. Copy that hash → set as FLUTTERWAVE_WEBHOOK_SECRET in your .env
 * 5. FLUTTERWAVE_SECRET_KEY = your Flutterwave secret key from Settings → API Keys section
 *    (This is different from the webhook hash.)
 */

import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { env } from "../../config/env.js";
import { getPaymentProvider } from "../../providers/payments/index.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { createReference } from "../../shared/utils/reference.js";
import { tenantQuery } from "../../shared/utils/tenant-query.js";
import { Payment } from "./payment.model.js";
import { Order } from "../orders/order.model.js";
import { sendKitchenTicketForOrder } from "../ai-ordering/kitchen-ticket.service.js";

export const paymentRouter = Router();

const paymentLinkSchema = z.object({
  orderId: z.string(),
  email: z.string().email().optional(),
});

paymentRouter.get("/", requireAuth, requireTenant, async (req, res) => {
  const payments = await Payment.find(tenantQuery(req.user!.tenantId!)).sort({ createdAt: -1 }).limit(100);
  res.json({ data: payments });
});

paymentRouter.post("/links", requireAuth, requireTenant, async (req, res) => {
  const payload = paymentLinkSchema.parse(req.body);
  const order = await Order.findOne(tenantQuery(req.user!.tenantId!, { _id: payload.orderId }));
  if (!order) {
    res.status(404).json({ error: { code: "ORDER_NOT_FOUND", message: "Order not found" } });
    return;
  }

  const reference = createReference("CHOWCALL");
  const provider = getPaymentProvider(order.payment?.provider as "paystack" | "flutterwave" | undefined);
  const amount = order.pricing?.totalPayable ?? 0;
  const link = await provider.createPaymentLink({
    amount,
    email: payload.email,
    phone: order.customer?.phone ?? undefined,
    reference,
    metadata: {
      orderId: order.id,
      tenantId: req.user!.tenantId,
      source: order.source,
    },
  });

  const payment = await Payment.create({
    tenantId: req.user!.tenantId,
    createdBy: req.user!.id,
    orderId: order.id,
    provider: link.provider,
    reference: link.reference,
    amount,
    authorizationUrl: link.authorizationUrl,
  });

  order.status = "PENDING_PAYMENT";
  order.payment = {
    provider: link.provider,
    reference: link.reference,
    authorizationUrl: link.authorizationUrl,
    expiresAt: new Date(Date.now() + env.PAYMENT_EXPIRY_MINUTES * 60_000),
  };
  await order.save();

  res.status(201).json({ data: { payment, order, authorizationUrl: link.authorizationUrl } });
});

paymentRouter.get("/:reference/verify", requireAuth, requireTenant, async (req, res) => {
  const payment = await Payment.findOne(tenantQuery(req.user!.tenantId!, { reference: req.params.reference }));
  if (!payment) {
    res.status(404).json({ error: { code: "PAYMENT_NOT_FOUND", message: "Payment not found" } });
    return;
  }

  const provider = getPaymentProvider(payment.provider as "paystack" | "flutterwave");
  const result = await provider.verify(payment.reference);
  if (result.paid && payment.status !== "paid") {
    payment.status = "paid";
    payment.paidAt = new Date();
    await payment.save();
    await Order.findByIdAndUpdate(payment.orderId, {
      status: "PAID",
      "payment.paidAt": payment.paidAt,
    });
    await sendKitchenTicketForOrder(String(payment.orderId));
  }

  res.json({ data: { paid: result.paid, payment, raw: result.raw } });
});

paymentRouter.post("/webhooks/paystack", async (req, res) => {
  const signature = req.header("x-paystack-signature") ?? "";
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const expected = createHmac("sha512", env.PAYSTACK_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (env.PAYSTACK_WEBHOOK_SECRET) {
    const valid =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      res.status(401).json({ error: { code: "INVALID_WEBHOOK_SIGNATURE" } });
      return;
    }
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  const reference = event?.data?.reference;
  const eventId = event?.data?.id?.toString() ?? reference;

  if (event?.event === "charge.success" && reference) {
    // Order payment
    const payment = await Payment.findOne({ reference });
    if (payment && !payment.rawWebhookEventIds.includes(eventId)) {
      payment.status = "paid";
      payment.paidAt = new Date();
      payment.rawWebhookEventIds.push(eventId);
      await payment.save();
      await Order.findByIdAndUpdate(payment.orderId, {
        status: "PAID",
        "payment.paidAt": payment.paidAt,
      });
      await sendKitchenTicketForOrder(String(payment.orderId));
    }

    // Subscription payment — auto-activate if reference matches pending sub
    const { Tenant } = await import("../tenants/tenant.model.js");
    const tenant = await Tenant.findOne({ "onboarding.pendingSubReference": reference });
    if (tenant && tenant.subscriptionStatus !== "active") {
      tenant.subscriptionStatus = "active";
      tenant.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await tenant.save();
    }
  }

  res.json({ received: true });
});

// POST /v1/payments/webhooks/flutterwave
paymentRouter.post("/webhooks/flutterwave", async (req, res) => {
  const signature = req.header("verif-hash") ?? "";
  if (env.FLUTTERWAVE_WEBHOOK_SECRET) {
    if (signature !== env.FLUTTERWAVE_WEBHOOK_SECRET) {
      res.status(401).json({ error: { code: "INVALID_WEBHOOK_SIGNATURE" } });
      return;
    }
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const event = JSON.parse(rawBody.toString("utf8"));
  const txRef: string | undefined = event?.data?.tx_ref;
  const eventId: string = String(event?.data?.id ?? txRef ?? "");
  const status: string = event?.data?.status ?? "";

  if (status === "successful" && txRef) {
    // Order payment
    const payment = await Payment.findOne({ reference: txRef });
    if (payment && !payment.rawWebhookEventIds.includes(eventId)) {
      payment.status = "paid";
      payment.paidAt = new Date();
      payment.rawWebhookEventIds.push(eventId);
      await payment.save();
      await Order.findByIdAndUpdate(payment.orderId, {
        status: "PAID",
        "payment.paidAt": payment.paidAt,
      });
      await sendKitchenTicketForOrder(String(payment.orderId));
    }

    // Subscription payment — handled in subscription.routes but we sync here too
    const { Tenant } = await import("../tenants/tenant.model.js");
    const tenant = await Tenant.findOne({ "onboarding.pendingSubReference": txRef });
    if (tenant && tenant.subscriptionStatus !== "active") {
      tenant.subscriptionStatus = "active";
      tenant.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await tenant.save();
    }
  }

  res.json({ received: true });
});

/**
 * GET /v1/payments/webhooks/paystack
 * Paystack redirects the customer's browser here after payment with
 * ?trxref=...&reference=... — we bounce them to the frontend billing/plan
 * page which then calls /v1/subscriptions/verify to confirm the payment.
 */
paymentRouter.get("/webhooks/paystack", async (req, res) => {
  const reference = (req.query.reference ?? req.query.trxref ?? "") as string;
  const frontendBase = env.FRONTEND_BASE_URL ?? "https://chowcall.live";

  if (!reference) {
    res.redirect(`${frontendBase}`);
    return;
  }

  // Try to find the tenant's slug from the pending sub reference so we
  // can redirect to the right workspace's billing/plan page.
  const { Tenant } = await import("../tenants/tenant.model.js");
  const tenant = await Tenant.findOne({ "onboarding.pendingSubReference": reference }).select("slug").lean();

  if (tenant?.slug) {
    res.redirect(`${frontendBase}/${tenant.slug}/billing/plan?reference=${encodeURIComponent(reference)}`);
  } else {
    // Fallback — the billing/plan page will verify and redirect to dashboard
    res.redirect(`${frontendBase}/billing/plan?reference=${encodeURIComponent(reference)}`);
  }
});

/**
 * GET /v1/payments/webhooks/flutterwave
 * Flutterwave redirects the customer here with ?tx_ref=...&status=...
 */
paymentRouter.get("/webhooks/flutterwave", async (req, res) => {
  const txRef = (req.query.tx_ref ?? "") as string;
  const status = (req.query.status ?? "") as string;
  const frontendBase = env.FRONTEND_BASE_URL ?? "https://chowcall.live";

  if (!txRef) {
    res.redirect(`${frontendBase}`);
    return;
  }

  const { Tenant } = await import("../tenants/tenant.model.js");
  const tenant = await Tenant.findOne({ "onboarding.pendingSubReference": txRef }).select("slug").lean();

  const base = tenant?.slug
    ? `${frontendBase}/${tenant.slug}/billing/plan`
    : `${frontendBase}/billing/plan`;

  res.redirect(`${base}?tx_ref=${encodeURIComponent(txRef)}&status=${encodeURIComponent(status)}`);
});

// GET /v1/payments/balance — tenant balance summary
paymentRouter.get("/balance", requireAuth, requireTenant, async (req, res) => {
  const tenantId = req.user!.tenantId!;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // All-time paid payments
  const [totalResult] = await Payment.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), status: "paid" } },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  // Today's paid payments
  const [todayResult] = await Payment.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), status: "paid", paidAt: { $gte: todayStart } } },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  // Pending today
  const pendingToday = await Payment.countDocuments({
    tenantId,
    status: "pending",
    createdAt: { $gte: todayStart },
  });

  res.json({
    data: {
      totalRevenue: totalResult?.total ?? 0,
      totalOrders: totalResult?.count ?? 0,
      todayRevenue: todayResult?.total ?? 0,
      todayOrders: todayResult?.count ?? 0,
      pendingToday,
    },
  });
});
