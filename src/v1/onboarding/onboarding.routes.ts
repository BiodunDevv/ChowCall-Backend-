import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { Tenant } from "../tenants/tenant.model.js";
import { MenuItem } from "../menu/menu-item.model.js";

const stepSchema = z.object({
  step: z.enum(["profile", "logo", "location", "hours", "menu", "delivery", "fees", "payment", "notifications", "escalation", "phone"]),
  data: z.record(z.unknown()),
});

export const onboardingRouter = Router();
onboardingRouter.use(requireAuth, requireTenant);

onboardingRouter.get("/", async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId);
  res.json({ data: tenant });
});

onboardingRouter.patch("/steps", async (req, res) => {
  const { step, data } = stepSchema.parse(req.body);
  const updates: Record<string, unknown> = {
    [`onboarding.currentStep`]: step,
    [`onboarding.stepData.${step}`]: data,
    "onboarding.updatedAt": new Date(),
  };
  if (step === "profile") Object.assign(updates, { name: data.name, phone: data.phone });
  if (step === "logo") updates.logo = (data as Record<string,unknown>).logoUrl;
  if (step === "location") Object.assign(updates, { address: data.address, mapPin: data.mapPin });
  if (step === "hours") updates.openingHours = data;
  if (step === "delivery") updates.deliveryPricing = data;
  if (step === "fees") updates.serviceFee = data;
  if (step === "payment") updates.payment = data;
  if (step === "notifications") updates.kitchenWhatsAppNumber = data.kitchenWhatsAppNumber;
  if (step === "escalation") updates.escalationContacts = data.contacts;
  if (step === "phone") updates.voice = data;

  const tenant = await Tenant.findByIdAndUpdate(req.user!.tenantId, {
    $set: updates,
    $addToSet: { "onboarding.completedSteps": step },
  }, { new: true, runValidators: true });
  res.json({ data: tenant });
});

onboardingRouter.get("/readiness", async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId);
  const menuCount = await MenuItem.countDocuments({ tenantId: req.user!.tenantId, available: true });
  const checks = {
    profile: Boolean(tenant?.name && tenant?.phone),
    location: Boolean(tenant?.address && tenant?.mapPin?.lat),
    menu: menuCount > 0,
    delivery: Boolean(tenant?.deliveryPricing),
    fees: Boolean(tenant?.serviceFee),
    payment: tenant?.payment?.provider === "paystack",
    notifications: Boolean(tenant?.kitchenWhatsAppNumber || tenant?.phone),
    phone: Boolean(tenant?.voice?.routingNumber || tenant?.voice?.dedicatedNumber),
  };
  const failures = Object.entries(checks).filter(([, ready]) => !ready).map(([name]) => name);
  await Tenant.findByIdAndUpdate(req.user!.tenantId, { $set: { "onboarding.checks": checks, "onboarding.readinessFailures": failures } });
  res.json({ data: { ready: failures.length === 0, checks, failures } });
});

onboardingRouter.post("/go-live", async (req, res) => {
  const tenant = await Tenant.findByIdAndUpdate(req.user!.tenantId, { $set: { "onboarding.status": "live" } }, { new: true });
  res.json({ data: tenant });
});
