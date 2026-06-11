import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { getPaymentProvider } from "../../providers/payments/index.js";
import { createReference } from "../../shared/utils/reference.js";
import { Tenant } from "../tenants/tenant.model.js";
import { Plan } from "../plans/plan.model.js";

export const subscriptionRouter = Router();
subscriptionRouter.use(requireAuth, requireTenant);

// GET /v1/subscriptions/plans — list active plans
subscriptionRouter.get("/plans", async (_req, res) => {
  const plans = await Plan.find({ active: true }).sort({ sortOrder: 1 });
  res.json({ data: plans });
});

// POST /v1/subscriptions/checkout — create a payment link for a plan
subscriptionRouter.post("/checkout", async (req, res) => {
  const { planSlug } = req.body as { planSlug: string };
  const plan = await Plan.findOne({ slug: planSlug, active: true });
  if (!plan) {
    res.status(404).json({ error: { code: "PLAN_NOT_FOUND", message: "Plan not found" } });
    return;
  }
  const reference = createReference("SUBSCC");
  const provider = getPaymentProvider("paystack");
  const link = await provider.createPaymentLink({
    amount: plan.priceMonthly,
    reference,
    metadata: {
      type: "subscription",
      planSlug,
      tenantId: req.user!.tenantId,
    },
  });
  // Store pending sub info on tenant
  await Tenant.findByIdAndUpdate(req.user!.tenantId, {
    $set: {
      subscribedPlan: planSlug,
      subscriptionStatus: "unpaid",
      "onboarding.pendingSubReference": reference,
    },
  });
  res.json({ data: { authorizationUrl: link.authorizationUrl, reference, plan } });
});

// POST /v1/subscriptions/verify — verify subscription payment
subscriptionRouter.post("/verify", async (req, res) => {
  const { reference } = req.body as { reference: string };
  const provider = getPaymentProvider("paystack");
  const result = await provider.verify(reference);
  if (result.paid) {
    const tenant = await Tenant.findByIdAndUpdate(
      req.user!.tenantId,
      {
        $set: {
          subscriptionStatus: "active",
          subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      { new: true }
    );
    res.json({ data: { paid: true, tenant } });
  } else {
    res.json({ data: { paid: false } });
  }
});

// GET /v1/subscriptions/status — get current subscription status
subscriptionRouter.get("/status", async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select("subscriptionStatus subscribedPlan subscriptionExpiresAt");
  res.json({ data: tenant });
});
