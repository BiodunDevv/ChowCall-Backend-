import { Router } from "express";
import { z } from "zod";
import { Tenant } from "./tenant.model.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  NOVA_SONIC_MODELS,
  NOVA_SONIC_V1_VOICES,
  isValidNovaSonicVoice,
  normalizeNovaSonicVoice,
} from "../../config/voice-options.js";

export const tenantRouter = Router();

// ── Public ────────────────────────────────────────────────────────────────────

tenantRouter.get("/by-slug/:slug", async (req, res) => {
  const tenant = await Tenant.findOne({ slug: req.params.slug }).select(
    "name slug logo subscriptionStatus phone address openingHours",
  );
  if (!tenant) {
    res.status(404).json({ error: { code: "TENANT_NOT_FOUND", message: "Tenant not found" } });
    return;
  }
  res.json({ data: tenant });
});

// ── Auth required ─────────────────────────────────────────────────────────────

tenantRouter.use(requireAuth);

tenantRouter.get("/", requireRoles("platform_owner", "platform_admin"), async (_req, res) => {
  res.json({ data: await Tenant.find().sort({ createdAt: -1 }).limit(100) });
});

tenantRouter.get("/current", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId);
  res.json({ data: tenant });
});

tenantRouter.patch(
  "/current",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res) => {
    const tenant = await Tenant.findByIdAndUpdate(req.user!.tenantId, req.body, {
      new: true,
      runValidators: true,
    });
    res.json({ data: tenant });
  },
);

// ── Opening hours ─────────────────────────────────────────────────────────────

const dayScheduleSchema = z.object({
  open: z.boolean(),
  from: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  to: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const hoursSchema = z.object({
  schedule: z.record(z.string(), dayScheduleSchema),
});

tenantRouter.get("/current/hours", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select("openingHours").lean();
  const hours = tenant?.openingHours;
  // Return null/empty object as null so frontend knows no schedule is set
  const hasSchedule = hours && typeof hours === "object" && Object.keys(hours).length > 0;
  res.json({ data: hasSchedule ? hours : null });
});

tenantRouter.patch(
  "/current/hours",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res, next) => {
    try {
      const { schedule } = hoursSchema.parse(req.body);
      const tenant = await Tenant.findByIdAndUpdate(
        req.user!.tenantId,
        { openingHours: schedule },
        { new: true },
      ).select("openingHours");
      res.json({ data: tenant?.openingHours ?? {} });
    } catch (err) {
      next(err);
    }
  },
);

// ── Web AI voice ordering ─────────────────────────────────────────────────────

const phoneSchema = z.object({
  enabled: z.boolean().optional(),
  phone: z.string().optional(),
  welcomeMessage: z.string().optional(),
  provider: z.literal("aws_nova_sonic").optional(),
  modelId: z.string().optional(),
  language: z.string().optional(),
  voiceId: z.string().optional(),
  speakingStyle: z.enum(["friendly", "professional", "warm", "fast", "calm"]).optional(),
  responseSpeed: z.enum(["normal", "fast"]).optional(),
  allowInterruptions: z.boolean().optional(),
  captionsEnabledByDefault: z.boolean().optional(),
  speechVoiceName: z.string().optional(),
  speechVoiceStyle: z.string().optional(),
  speechLanguage: z.string().optional(),
  instructions: z.string().optional(),
});

tenantRouter.get("/current/phone", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select("phone voice aiAgent").lean<{
    phone?: string;
    voice?: Record<string, unknown>;
    aiAgent?: { instructions?: string; enabled?: boolean };
  }>();
  res.json({
    data: {
      ...(tenant?.voice ?? {}),
      voiceSettings: normalizeNovaSonicVoice(tenant?.voice ?? null),
      models: NOVA_SONIC_MODELS,
      voiceOptions: NOVA_SONIC_V1_VOICES,
      phone: tenant?.phone ?? "",
      instructions: tenant?.aiAgent?.instructions ?? "",
    },
  });
});

tenantRouter.patch(
  "/current/phone",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res, next) => {
    try {
      const payload = phoneSchema.parse(req.body);
      const language = payload.language ?? payload.speechLanguage;
      const voiceId = payload.voiceId ?? payload.speechVoiceName;
      if (language && voiceId && !isValidNovaSonicVoice(language, voiceId)) {
        throw new AppError(400, "That voice is not available for the selected language.", "INVALID_VOICE_LANGUAGE");
      }
      const tenant = await Tenant.findByIdAndUpdate(
        req.user!.tenantId,
        {
          ...(payload.phone !== undefined && { phone: payload.phone.trim() || undefined }),
          ...(payload.enabled !== undefined && { "voice.enabled": payload.enabled }),
          ...(payload.welcomeMessage !== undefined && { "voice.greeting": payload.welcomeMessage }),
          "voice.provider": "aws_nova_sonic",
          ...(payload.modelId !== undefined && { "voice.modelId": payload.modelId }),
          ...(language !== undefined && { "voice.language": language }),
          ...(voiceId !== undefined && { "voice.voiceId": voiceId }),
          ...(payload.speakingStyle !== undefined && { "voice.speakingStyle": payload.speakingStyle }),
          ...(payload.responseSpeed !== undefined && { "voice.responseSpeed": payload.responseSpeed }),
          ...(payload.allowInterruptions !== undefined && { "voice.allowInterruptions": payload.allowInterruptions }),
          ...(payload.captionsEnabledByDefault !== undefined && { "voice.captionsEnabledByDefault": payload.captionsEnabledByDefault }),
          ...(payload.speechVoiceName !== undefined && { "voice.speechVoiceName": payload.speechVoiceName }),
          ...(payload.speechVoiceStyle !== undefined && { "voice.speechVoiceStyle": payload.speechVoiceStyle }),
          ...(payload.speechLanguage !== undefined && { "voice.speechLanguage": payload.speechLanguage }),
          ...(payload.instructions !== undefined && { "aiAgent.enabled": true, "aiAgent.instructions": payload.instructions.trim() }),
        },
        { new: true },
      ).select("phone voice aiAgent");
      res.json({
        data: {
          ...((tenant as { voice?: Record<string, unknown> } | null)?.voice ?? {}),
          voiceSettings: normalizeNovaSonicVoice((tenant as { voice?: Record<string, unknown> } | null)?.voice ?? null),
          models: NOVA_SONIC_MODELS,
          voiceOptions: NOVA_SONIC_V1_VOICES,
          phone: (tenant as { phone?: string } | null)?.phone ?? "",
          instructions: (tenant as { aiAgent?: { instructions?: string } } | null)?.aiAgent?.instructions ?? "",
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── Payment provider ──────────────────────────────────────────────────────────

const paymentSchema = z.object({
  provider: z.enum(["paystack", "flutterwave", "cash"]),
  payOnDeliveryEnabled: z.boolean().optional(),
});

tenantRouter.get("/current/payment", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select("payment").lean();
  res.json({ data: tenant?.payment ?? {} });
});

tenantRouter.patch(
  "/current/payment",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res, next) => {
    try {
      const payload = paymentSchema.parse(req.body);
      const updateFields: Record<string, unknown> = {
        "payment.provider": payload.provider === "cash" ? "paystack" : payload.provider,
        "payment.payOnDeliveryEnabled": payload.provider === "cash" ? true : (payload.payOnDeliveryEnabled ?? false),
      };
      const tenant = await Tenant.findByIdAndUpdate(
        req.user!.tenantId,
        updateFields,
        { new: true },
      ).select("payment");
      res.json({ data: tenant?.payment ?? {} });
    } catch (err) {
      next(err);
    }
  },
);

// ── AI agent config ───────────────────────────────────────────────────────────

const aiAgentSchema = z.object({
  enabled: z.boolean(),
  instructions: z.string().optional(),
});

const publicPageSchema = z.object({
  logoUrl: z.string().url().optional().or(z.literal("")),
  heroImageLightUrl: z.string().url().optional().or(z.literal("")),
  heroImageDarkUrl: z.string().url().optional().or(z.literal("")),
  heroHeadline: z.string().max(120).optional().or(z.literal("")),
  description: z.string().max(600).optional().or(z.literal("")),

  category: z.string().max(80).optional().or(z.literal("")),
  instagramUrl: z.string().url().optional().or(z.literal("")),
  twitterUrl: z.string().url().optional().or(z.literal("")),
  facebookUrl: z.string().url().optional().or(z.literal("")),
  tiktokUrl: z.string().url().optional().or(z.literal("")),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  whatsappNumber: z.string().max(32).optional().or(z.literal("")),
  bannerText: z.string().max(140).optional().or(z.literal("")),
  bannerEnabled: z.boolean().optional(),
  showPopularItems: z.boolean().optional(),
  pickupEnabled: z.boolean().optional(),
  deliveryEnabled: z.boolean().optional(),
  estimatedPrepTime: z.number().int().min(0).max(240).optional().nullable(),
});

const publicPageSelect =
  "logo heroImageLightUrl heroImageDarkUrl heroHeadline description category instagramUrl twitterUrl facebookUrl tiktokUrl websiteUrl whatsappNumber bannerText bannerEnabled showPopularItems pickupEnabled deliveryEnabled estimatedPrepTime";

function normalizeAiAgent(aiAgent?: { enabled?: boolean; instructions?: string } | null) {
  return {
    enabled: aiAgent?.enabled !== false,
    instructions: aiAgent?.instructions ?? "",
  };
}

function normalizePublicPage(input: z.infer<typeof publicPageSchema>) {
  return {
    logo: input.logoUrl?.trim() || undefined,
    heroImageLightUrl: input.heroImageLightUrl?.trim() || undefined,
    heroImageDarkUrl: input.heroImageDarkUrl?.trim() || undefined,
    heroHeadline: input.heroHeadline?.trim() || "",
    description: input.description?.trim() || "",
    category: input.category?.trim() || "",
    instagramUrl: input.instagramUrl?.trim() || "",
    twitterUrl: input.twitterUrl?.trim() || "",
    facebookUrl: input.facebookUrl?.trim() || "",
    tiktokUrl: input.tiktokUrl?.trim() || "",
    websiteUrl: input.websiteUrl?.trim() || "",
    whatsappNumber: input.whatsappNumber?.trim() || "",
    bannerText: input.bannerText?.trim() || "",
    bannerEnabled: input.bannerEnabled ?? false,
    showPopularItems: input.showPopularItems ?? true,
    pickupEnabled: input.pickupEnabled ?? true,
    deliveryEnabled: input.deliveryEnabled ?? true,
    estimatedPrepTime: input.estimatedPrepTime ?? undefined,
  };
}

tenantRouter.get("/current/ai-agent", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId)
    .select("aiAgent")
    .lean() as { aiAgent?: { enabled?: boolean; instructions?: string } } | null;
  res.json({ data: normalizeAiAgent(tenant?.aiAgent) });
});

tenantRouter.patch(
  "/current/ai-agent",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res, next) => {
    try {
      const payload = aiAgentSchema.parse(req.body);
      const tenant = await Tenant.findByIdAndUpdate(
        req.user!.tenantId,
        { aiAgent: normalizeAiAgent(payload) },
        { new: true },
      ).select("aiAgent");
      res.json({ data: normalizeAiAgent((tenant as { aiAgent?: { enabled?: boolean; instructions?: string } } | null)?.aiAgent) });
    } catch (err) {
      next(err);
    }
  },
);

// ── Public AI page config ────────────────────────────────────────────────────

tenantRouter.get("/current/public-page", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select(publicPageSelect).lean();
  res.json({
    data: {
      logoUrl: tenant?.logo ?? "",
      heroImageLightUrl: (tenant as Record<string, unknown>)?.heroImageLightUrl as string ?? "",
      heroImageDarkUrl: (tenant as Record<string, unknown>)?.heroImageDarkUrl as string ?? "",
      heroHeadline: (tenant as Record<string, unknown>)?.heroHeadline as string ?? "",
      description: tenant?.description ?? "",
      category: tenant?.category ?? "",
      instagramUrl: tenant?.instagramUrl ?? "",
      twitterUrl: (tenant as Record<string, unknown>)?.twitterUrl as string ?? "",
      facebookUrl: (tenant as Record<string, unknown>)?.facebookUrl as string ?? "",
      tiktokUrl: (tenant as Record<string, unknown>)?.tiktokUrl as string ?? "",
      websiteUrl: (tenant as Record<string, unknown>)?.websiteUrl as string ?? "",
      whatsappNumber: tenant?.whatsappNumber ?? "",
      bannerText: tenant?.bannerText ?? "",
      bannerEnabled: tenant?.bannerEnabled ?? false,
      showPopularItems: tenant?.showPopularItems ?? true,
      pickupEnabled: tenant?.pickupEnabled ?? true,
      deliveryEnabled: tenant?.deliveryEnabled ?? true,
      estimatedPrepTime: tenant?.estimatedPrepTime ?? undefined,
    },
  });
});

tenantRouter.patch(
  "/current/public-page",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res, next) => {
    try {
      const payload = normalizePublicPage(publicPageSchema.parse(req.body));
      const tenant = await Tenant.findByIdAndUpdate(req.user!.tenantId, payload, {
        new: true,
        runValidators: true,
      }).select(publicPageSelect);
      res.json({ data: tenant });
    } catch (err) {
      next(err);
    }
  },
);

tenantRouter.get("/current/storefront", requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user!.tenantId).select(publicPageSelect).lean();
  res.json({
    data: {
      logoUrl: tenant?.logo ?? "",
      heroImageLightUrl: (tenant as Record<string, unknown>)?.heroImageLightUrl as string ?? "",
      heroImageDarkUrl: (tenant as Record<string, unknown>)?.heroImageDarkUrl as string ?? "",
      heroHeadline: (tenant as Record<string, unknown>)?.heroHeadline as string ?? "",
      description: tenant?.description ?? "",
      category: tenant?.category ?? "",
      instagramUrl: tenant?.instagramUrl ?? "",
      twitterUrl: (tenant as Record<string, unknown>)?.twitterUrl as string ?? "",
      facebookUrl: (tenant as Record<string, unknown>)?.facebookUrl as string ?? "",
      tiktokUrl: (tenant as Record<string, unknown>)?.tiktokUrl as string ?? "",
      websiteUrl: (tenant as Record<string, unknown>)?.websiteUrl as string ?? "",
      whatsappNumber: tenant?.whatsappNumber ?? "",
      bannerText: tenant?.bannerText ?? "",
      bannerEnabled: tenant?.bannerEnabled ?? false,
      showPopularItems: tenant?.showPopularItems ?? true,
      pickupEnabled: tenant?.pickupEnabled ?? true,
      deliveryEnabled: tenant?.deliveryEnabled ?? true,
      estimatedPrepTime: tenant?.estimatedPrepTime ?? undefined,
    },
  });
});

tenantRouter.patch(
  "/current/storefront",
  requireTenant,
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res, next) => {
    try {
      const payload = normalizePublicPage(publicPageSchema.parse(req.body));
      const tenant = await Tenant.findByIdAndUpdate(req.user!.tenantId, payload, {
        new: true,
        runValidators: true,
      }).select(publicPageSelect);
      res.json({ data: tenant });
    } catch (err) {
      next(err);
    }
  },
);
