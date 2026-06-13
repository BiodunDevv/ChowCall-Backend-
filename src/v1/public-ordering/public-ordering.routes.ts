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
import {
  createOrderFromSession,
  createPublicPaymentLink,
  handleOrderingMessage,
  startOrderingSession,
  verifyPublicOrderAccess,
} from "../ai-ordering/ai-ordering-engine.js";
import { liveVoiceRouter } from "./live-voice.routes.js";
import { normalizeNovaSonicVoice } from "../../config/voice-options.js";
import { isRestaurantOpen } from "../../shared/utils/restaurant-hours.js";

export const publicOrderingRouter = Router();

publicOrderingRouter.use("/:tenantSlug/live-voice", liveVoiceRouter);

function requireRestaurantOpen(openingHours: unknown) {
  if (!isRestaurantOpen(openingHours)) {
    throw new AppError(409, "This restaurant is currently closed and is not accepting orders.", "RESTAURANT_CLOSED");
  }
}

function normalizeMenuName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

async function resolvePublicOrderItems(
  tenantId: unknown,
  inputItems: Array<{
    menuItemId?: string;
    id?: string;
    name?: string;
    quantity?: number;
    notes?: string;
  }> = []
) {
  if (!inputItems.length) {
    throw new AppError(400, "At least one order item is required.", "ORDER_ITEMS_REQUIRED");
  }

  const menuItems = await MenuItem.find({ tenantId }).lean<
    Array<{
      _id: unknown;
      name: string;
      basePrice: number;
      available: boolean;
    }>
  >();

  return inputItems.map((inputItem) => {
    const requestedId = (inputItem.menuItemId ?? inputItem.id ?? "").trim();
    const requestedName = (inputItem.name ?? "").trim();
    const menuItem = requestedId
      ? menuItems.find((item) => String(item._id) === requestedId)
      : menuItems.find((item) => normalizeMenuName(item.name) === normalizeMenuName(requestedName));

    if (!menuItem) {
      throw new AppError(
        422,
        `${requestedName || "One item"} is no longer on this restaurant menu.`,
        "ORDER_ITEM_INVALID"
      );
    }
    if (!menuItem.available) {
      throw new AppError(422, `${menuItem.name} is sold out right now.`, "ORDER_ITEM_UNAVAILABLE");
    }

    return {
      menuItemId: String(menuItem._id),
      name: menuItem.name,
      quantity: Math.max(1, Math.min(20, Number(inputItem.quantity ?? 1) || 1)),
      unitPrice: Number(menuItem.basePrice ?? 0),
      ...(inputItem.notes ? { notes: String(inputItem.notes).slice(0, 500) } : {}),
    };
  });
}

function publicTenantPayload(tenant: {
  id?: string;
  _id?: unknown;
  name: string;
  slug: string;
  logo?: string | null;
  phone?: string | null;
  address?: string | null;
  openingHours?: unknown;
  subscriptionStatus?: string;
  voice?: {
    enabled?: boolean | null;
    greeting?: string | null;
    provider?: string | null;
    modelId?: string | null;
    language?: string | null;
    voiceId?: string | null;
    speakingStyle?: string | null;
    responseSpeed?: string | null;
    allowInterruptions?: boolean | null;
    captionsEnabledByDefault?: boolean | null;
    routingNumber?: string | null;
    dedicatedNumber?: string | null;
    speechVoiceName?: string | null;
    speechVoiceStyle?: string | null;
    speechLanguage?: string | null;
  } | null;
  aiAgent?: { enabled?: boolean | null; instructions?: string | null } | null;
  onboarding?: { status?: string | null } | null;
  coverImageUrl?: string | null;
  heroImageLightUrl?: string | null;
  heroImageDarkUrl?: string | null;
  heroHeadline?: string | null;
  description?: string | null;
  category?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  websiteUrl?: string | null;
  whatsappNumber?: string | null;
  bannerText?: string | null;
  bannerEnabled?: boolean | null;
  showPopularItems?: boolean | null;
  pickupEnabled?: boolean | null;
  deliveryEnabled?: boolean | null;
  estimatedPrepTime?: number | null;
}) {
  const voiceSettings = normalizeNovaSonicVoice(tenant.voice ?? null);
  return {
    id: tenant.id ?? String(tenant._id ?? ""),
    name: tenant.name,
    slug: tenant.slug,
    logo: tenant.logo ?? null,
    phone: tenant.phone ?? null,
    address: tenant.address ?? null,
    openingHours: tenant.openingHours ?? {},
    aiGreeting:
      tenant.voice?.greeting ??
      `Hi, welcome to ${tenant.name}. Are you ordering for pickup or delivery today?`,
    voice: {
      enabled: tenant.voice?.enabled !== false,
      greeting:
        tenant.voice?.greeting ??
        `Welcome to ${tenant.name}. What would you like to order today?`,
      ...voiceSettings,
      speechVoiceName: voiceSettings.voiceId,
      speechVoiceStyle: voiceSettings.speakingStyle,
      speechLanguage: voiceSettings.language,
    },
    aiAgent: {
      enabled: tenant.aiAgent?.enabled !== false,
      instructions: tenant.aiAgent?.instructions ?? "",
    },
    subscriptionStatus: tenant.subscriptionStatus,
    active: tenant.subscriptionStatus === "active",
    coverImageUrl: tenant.coverImageUrl ?? null,
    heroImageLightUrl: tenant.heroImageLightUrl ?? null,
    heroImageDarkUrl: tenant.heroImageDarkUrl ?? null,
    heroHeadline: tenant.heroHeadline ?? null,
    description: tenant.description ?? null,
    category: tenant.category ?? null,
    instagramUrl: tenant.instagramUrl ?? null,
    twitterUrl: tenant.twitterUrl ?? null,
    facebookUrl: tenant.facebookUrl ?? null,
    tiktokUrl: tenant.tiktokUrl ?? null,
    websiteUrl: tenant.websiteUrl ?? null,
    whatsappNumber: tenant.whatsappNumber ?? null,
    bannerText: tenant.bannerText ?? null,
    bannerEnabled: tenant.bannerEnabled ?? false,
    showPopularItems: tenant.showPopularItems ?? true,
    pickupEnabled: tenant.pickupEnabled ?? true,
    deliveryEnabled: tenant.deliveryEnabled ?? true,
    estimatedPrepTime: tenant.estimatedPrepTime ?? null,
  };
}

async function resolvePublicTenant(tenantSlug: string, options: { requireActive?: boolean } = {}) {
  const tenant = await Tenant.findOne({ slug: tenantSlug }).lean();
  if (!tenant) throw new AppError(404, "Restaurant not found", "TENANT_NOT_FOUND");
  const payload = publicTenantPayload(tenant);
  if (options.requireActive && !payload.active) {
    throw new AppError(
      403,
      "AI ordering is available after this restaurant activates ChowCall.",
      "AI_ORDERING_REQUIRES_ACTIVE_SUBSCRIPTION"
    );
  }
  return { tenant, payload };
}

publicOrderingRouter.get("/:tenantSlug", async (req, res, next) => {
  try {
    const { payload } = await resolvePublicTenant(req.params.tenantSlug);
    res.json({ data: payload });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.get("/:tenantSlug/menu", async (req, res, next) => {
  try {
    const { tenant, payload } = await resolvePublicTenant(req.params.tenantSlug);
    const items = await MenuItem.find({ tenantId: tenant._id }).sort({ category: 1, name: 1 }).lean();
    res.json({ tenant: payload, data: items });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.post("/:tenantSlug/chat", async (req, res, next) => {
  try {
    const message = String(req.body?.message ?? "").trim();
    if (!message) {
      const data = await startOrderingSession(req.params.tenantSlug);
      res.json({ data: { ...data, reply: data.assistantMessage } });
      return;
    }
    const data = await handleOrderingMessage({
      tenantSlug: req.params.tenantSlug,
      sessionId: req.body?.sessionId,
      message,
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.post("/:tenantSlug/chat/session", async (req, res, next) => {
  try {
    const data = await startOrderingSession(req.params.tenantSlug);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.post("/:tenantSlug/chat/message", async (req, res, next) => {
  try {
    const message = String(req.body?.message ?? "").trim();
    if (!message) throw new AppError(400, "Message is required.", "CHAT_MESSAGE_REQUIRED");
    const data = await handleOrderingMessage({
      tenantSlug: req.params.tenantSlug,
      sessionId: req.body?.sessionId,
      message,
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.post("/:tenantSlug/orders", async (req, res, next) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "");
    if (!sessionId) throw new AppError(400, "Session id is required.", "CHAT_SESSION_REQUIRED");
    const data = await createOrderFromSession({
      tenantSlug: req.params.tenantSlug,
      sessionId,
      customer: req.body?.customer,
      items: req.body?.items,
      fulfilmentType: req.body?.fulfilmentType,
    });
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.post("/:tenantSlug/orders/:orderId/confirm", async (req, res, next) => {
  try {
    const { tenant } = await resolvePublicTenant(req.params.tenantSlug, { requireActive: true });
    const order = await Order.findOne({ _id: req.params.orderId, tenantId: tenant._id }).select("+publicStatusTokenHash");
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");
    if (
      !verifyPublicOrderAccess(order as unknown as { publicStatusTokenHash?: string; customer?: { phone?: string } }, {
        token: String(req.body?.token ?? req.query.token ?? ""),
        phone: String(req.body?.phone ?? ""),
      })
    ) {
      throw new AppError(403, "Order status token or phone verification is required.", "ORDER_STATUS_ACCESS_DENIED");
    }
    if (order.status === "PRICED") {
      order.status = "PENDING_PAYMENT";
      await order.save();
    }
    res.json({ data: { order } });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.post("/:tenantSlug/orders/:orderId/payment-link", async (req, res, next) => {
  try {
    const data = await createPublicPaymentLink({
      tenantSlug: req.params.tenantSlug,
      orderId: req.params.orderId,
      statusToken: String(req.body?.token ?? req.query.token ?? ""),
    });
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.post("/:tenantSlug/quote", async (req, res, next) => {
  try {
    const { tenant } = await resolvePublicTenant(req.params.tenantSlug, { requireActive: true });
    requireRestaurantOpen(tenant.openingHours);
    const items = await resolvePublicOrderItems(tenant._id, req.body.items ?? []);

    const priced = priceOrder({
      fulfilmentType: req.body.fulfilmentType ?? "delivery",
      distanceKm: req.body.distanceKm,
      durationMinutes: req.body.durationMinutes,
      discount: req.body.discount ?? 0,
      items,
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
    const { tenant } = await resolvePublicTenant(req.params.tenantSlug, { requireActive: true });
    requireRestaurantOpen(tenant.openingHours);
    const items = await resolvePublicOrderItems(tenant._id, req.body.items ?? []);

    const priced = priceOrder({
      fulfilmentType: req.body.fulfilmentType ?? "delivery",
      distanceKm: req.body.distanceKm,
      durationMinutes: req.body.durationMinutes,
      discount: req.body.discount ?? 0,
      items,
      deliveryPricing: tenant.deliveryPricing as unknown as DeliveryPricingConfig,
      serviceFee: tenant.serviceFee as unknown as ServiceFeeConfig,
    });

    const tenantId = String(tenant._id);
    const order = await Order.create({
      tenantId,
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
      metadata: { orderId: order.id, tenantId, source: "public_ordering" },
    });

    const payment = await Payment.create({
      tenantId,
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
        statusUrl: `/order/${tenant.slug}/status/${order.id}`,
      },
    });
  } catch (error) {
    next(error);
  }
});

publicOrderingRouter.get("/:tenantSlug/orders/:orderId/status", async (req, res, next) => {
  try {
    const { tenant, payload } = await resolvePublicTenant(req.params.tenantSlug);
    const order = await Order.findOne({ _id: req.params.orderId, tenantId: tenant._id }).select("+publicStatusTokenHash").lean();
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");
    if (
      !verifyPublicOrderAccess(order as unknown as { publicStatusTokenHash?: string; customer?: { phone?: string } }, {
        token: String(req.query.token ?? ""),
        phone: String(req.query.phone ?? ""),
      })
    ) {
      throw new AppError(403, "Order status token or phone verification is required.", "ORDER_STATUS_ACCESS_DENIED");
    }
    const payment = await Payment.findOne({ orderId: order._id, tenantId: tenant._id }).lean();
    res.json({
      data: {
        tenant: payload,
        order: {
          id: String(order._id),
          orderNumber: order.orderNumber,
          status: order.status,
          source: order.source,
          fulfilmentType: order.fulfilmentType,
          customer: {
            name: order.customer?.name,
            phone: order.customer?.phone,
            address: order.customer?.address,
            landmark: order.customer?.landmark,
          },
          items: order.items,
          pricing: order.pricing,
          payment: {
            reference: order.payment?.reference,
            paidAt: order.payment?.paidAt,
            status: payment?.status ?? (order.payment?.paidAt ? "paid" : "pending"),
          },
        },
      },
    });
  } catch (error) {
    next(error);
  }
});
