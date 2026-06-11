import { randomBytes, createHash } from "node:crypto";
import type { FilterQuery } from "mongoose";
import { AppError } from "../../shared/errors/app-error.js";
import { createReference } from "../../shared/utils/reference.js";
import { mapboxMapsProvider } from "../../providers/maps/mapbox-maps.provider.js";
import { twilioSmsProvider } from "../../providers/messaging/twilio-sms.provider.js";
import { getPaymentProvider } from "../../providers/payments/index.js";
import { env } from "../../config/env.js";
import { MenuItem } from "../menu/menu-item.model.js";
import { Order } from "../orders/order.model.js";
import { priceOrder, type PriceableOrderItem } from "../orders/order-pricing.service.js";
import { Payment } from "../payments/payment.model.js";
import type { DeliveryPricingConfig, ServiceFeeConfig } from "../pricing/pricing.types.js";
import { Tenant } from "../tenants/tenant.model.js";
import { ChatSession } from "./chat-session.model.js";

type PublicTenantDoc = {
  _id: unknown;
  id?: string;
  name: string;
  slug: string;
  phone?: string | null;
  address?: string | null;
  mapPin?: { lat?: number; lng?: number } | null;
  deliveryPricing?: unknown;
  serviceFee?: unknown;
  payment?: { provider?: "paystack" | "flutterwave"; payOnDeliveryEnabled?: boolean } | null;
  aiAgent?: { enabled?: boolean | null; instructions?: string | null } | null;
};

type MenuDoc = {
  _id: unknown;
  name: string;
  category?: string;
  description?: string;
  basePrice: number;
  available: boolean;
  variants?: Array<{ name?: string; options?: Array<{ name?: string; price?: number }> }>;
  addons?: Array<{ name?: string; price?: number }>;
};

type DraftItem = PriceableOrderItem & {
  menuItemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

type PricingDraftResult = {
  items: Array<DraftItem | PriceableOrderItem>;
  pricing?: {
    itemSubtotal: number;
    deliveryFee: number;
    serviceFee: number;
    discount: number;
    totalPayable: number;
    distanceKm?: number;
    durationMinutes?: number;
  };
  outOfZone?: boolean;
  customerPatch?: { lat: number; lng: number; mapLink: string; address: string };
};

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function tenantId(tenant: PublicTenantDoc) {
  return String(tenant._id);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getQuantityBefore(text: string, index: number) {
  const before = text.slice(Math.max(0, index - 24), index).trim();
  const digit = before.match(/(\d+)\s*$/);
  if (digit) return Math.max(1, Number(digit[1]));
  const word = before.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*$/);
  return word ? numberWords[word[1]] ?? 1 : 1;
}

function asDraftItem(item: MenuDoc, quantity: number): DraftItem {
  return {
    menuItemId: String(item._id),
    name: item.name,
    quantity,
    unitPrice: Number(item.basePrice ?? 0),
  };
}

function mergeDraftItems(current: DraftItem[], incoming: DraftItem[]) {
  const map = new Map<string, DraftItem>();
  for (const item of current) {
    const key = item.menuItemId ?? item.name;
    map.set(key, { ...item });
  }
  for (const item of incoming) {
    const key = item.menuItemId ?? item.name;
    const existing = map.get(key);
    map.set(key, existing ? { ...existing, quantity: existing.quantity + item.quantity } : item);
  }
  return Array.from(map.values());
}

function matchMenuItems(message: string, menuItems: MenuDoc[]) {
  const normalizedMessage = normalize(message);
  const added: DraftItem[] = [];
  const unavailable: string[] = [];
  const ambiguous: string[] = [];

  for (const item of menuItems) {
    const itemName = normalize(item.name);
    const tokens = itemName.split(" ").filter((token) => token.length > 2);
    const fullIndex = normalizedMessage.indexOf(itemName);
    const matchedIndex =
      fullIndex >= 0
        ? fullIndex
        : tokens.length > 0
          ? tokens.reduce((found, token) => (found >= 0 ? found : normalizedMessage.indexOf(token)), -1)
          : -1;

    if (matchedIndex < 0) continue;
    if (!item.available) {
      unavailable.push(item.name);
      continue;
    }
    const quantity = getQuantityBefore(normalizedMessage, matchedIndex);
    added.push(asDraftItem(item, quantity));
  }

  const shortMatches = menuItems.filter((item) => {
    const first = normalize(item.name).split(" ")[0];
    return first.length > 2 && normalize(message).includes(first);
  });
  if (shortMatches.length > 1 && added.length === 0) {
    ambiguous.push(...shortMatches.slice(0, 4).map((item) => item.name));
  }

  return { added, unavailable, ambiguous };
}

function detectFulfilment(message: string) {
  const text = normalize(message);
  if (/\b(deliver|delivery|send|bring)\b/.test(text)) return "delivery" as const;
  if (/\b(pickup|pick up|collect|takeaway|take away)\b/.test(text)) return "pickup" as const;
  return null;
}

function detectCustomerPatch(message: string, currentFulfilment?: string | null) {
  const phone = message.match(/(?:\+?234|0)[789][01]\d{8}/)?.[0];
  const addressMatch = message.match(/(?:deliver(?:y)? to|address is|send to|bring it to)\s+(.+)/i);
  const wantsAddress = currentFulfilment === "delivery" && message.length > 12 && !/\b(menu|cart|total|pay|checkout)\b/i.test(message);
  return {
    phone,
    address: addressMatch?.[1]?.trim() ?? (wantsAddress ? message.trim() : undefined),
  };
}

async function resolveTenant(tenantSlug: string) {
  const tenant = await Tenant.findOne({ slug: tenantSlug }).lean<PublicTenantDoc>();
  if (!tenant) throw new AppError(404, "Restaurant not found", "TENANT_NOT_FOUND");
  const active = tenant.aiAgent?.enabled !== false;
  if (!active) throw new AppError(404, "AI ordering is not active for this restaurant.", "AI_ORDERING_DISABLED");
  return tenant;
}

async function getMenu(tenant: PublicTenantDoc) {
  return MenuItem.find({ tenantId: tenant._id }).sort({ category: 1, name: 1 }).lean<MenuDoc[]>();
}

async function resolveDeliveryDistance(tenant: PublicTenantDoc, address?: string) {
  if (!address || !tenant.mapPin?.lat || !tenant.mapPin?.lng) return {};
  try {
    const destination = await mapboxMapsProvider.geocode(address);
    const route = await mapboxMapsProvider.routeDistance(
      { lat: Number(tenant.mapPin.lat), lng: Number(tenant.mapPin.lng) },
      { lat: destination.lat, lng: destination.lng }
    );
    return {
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      customer: {
        lat: destination.lat,
        lng: destination.lng,
        mapLink: mapboxMapsProvider.mapLink(destination.lat, destination.lng),
        address: destination.formattedAddress,
      },
    };
  } catch {
    return {};
  }
}

function computeNeeds(input: {
  items: DraftItem[];
  fulfilmentType?: "pickup" | "delivery" | null;
  customer?: { name?: string; phone?: string; email?: string; address?: string };
}) {
  const needs: string[] = [];
  if (input.items.length === 0) needs.push("items");
  if (!input.fulfilmentType) needs.push("fulfilmentType");
  if (input.fulfilmentType === "delivery" && !input.customer?.address) needs.push("deliveryAddress");
  if (!input.customer?.phone) needs.push("customerPhone");
  if (!input.customer?.name) needs.push("customerName");
  return needs;
}

async function priceDraft(input: {
  tenant: PublicTenantDoc;
  items: DraftItem[];
  fulfilmentType?: "pickup" | "delivery" | null;
  customer?: { address?: string };
}): Promise<PricingDraftResult> {
  if (input.items.length === 0 || !input.fulfilmentType) return { pricing: undefined, items: input.items };
  const delivery = input.fulfilmentType === "delivery" ? await resolveDeliveryDistance(input.tenant, input.customer?.address) : {};
  const priced = priceOrder({
    fulfilmentType: input.fulfilmentType,
    distanceKm: delivery.distanceKm,
    durationMinutes: delivery.durationMinutes,
    items: input.items,
    deliveryPricing: input.tenant.deliveryPricing as DeliveryPricingConfig,
    serviceFee: input.tenant.serviceFee as ServiceFeeConfig,
  });
  return { ...priced, customerPatch: delivery.customer };
}

function assistantMessage(input: {
  tenant: PublicTenantDoc;
  added: DraftItem[];
  unavailable: string[];
  ambiguous: string[];
  needs: string[];
  total?: number;
}) {
  if (input.unavailable.length) {
    return `${input.unavailable.join(", ")} is sold out right now. I can help you choose another available dish from ${input.tenant.name}.`;
  }
  if (input.ambiguous.length) {
    return `I found a few possible matches: ${input.ambiguous.join(", ")}. Which one should I add?`;
  }
  const added = input.added.map((item) => `${item.quantity}x ${item.name}`).join(", ");
  const prefix = added ? `Added ${added}. ` : "";
  if (input.needs.includes("items")) return `${prefix}Tell me what you would like from the menu, or say "show menu".`;
  if (input.needs.includes("fulfilmentType")) return `${prefix}Is this for pickup or delivery?`;
  if (input.needs.includes("deliveryAddress")) return `${prefix}Please send the delivery address so I can calculate the delivery fee.`;
  if (input.needs.includes("customerPhone")) return `${prefix}Please share the phone number for this order.`;
  if (input.needs.includes("customerName")) return `${prefix}What name should the kitchen put on the order?`;
  return `${prefix}Your order is ready for payment. The total is ${input.total ? `NGN ${Math.round(input.total).toLocaleString("en-NG")}` : "calculated"}.`;
}

function publicSessionPayload(session: {
  _id: unknown;
  status?: string;
  items?: unknown;
  fulfilmentType?: unknown;
  customer?: unknown;
  pricing?: unknown;
  needs?: unknown;
  orderId?: unknown;
} | null) {
  if (!session) return null;
  return {
    id: String(session._id),
    status: session.status,
    items: session.items ?? [],
    fulfilmentType: session.fulfilmentType ?? null,
    customer: session.customer ?? {},
    pricing: session.pricing ?? {},
    needs: session.needs ?? [],
    orderId: session.orderId ? String(session.orderId) : null,
  };
}

export async function startOrderingSession(tenantSlug: string) {
  const tenant = await resolveTenant(tenantSlug);
  const greeting = `Hi, welcome to ${tenant.name}. Tell me what you would like to order, then I will confirm pickup or delivery and price it for payment.`;
  const session = await ChatSession.create({
    tenantId: tenantId(tenant),
    tenantSlug: tenant.slug,
    status: "active",
    needs: ["items", "fulfilmentType", "customerPhone", "customerName"],
    lastAssistantMessage: greeting,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    messages: [{ role: "assistant", content: greeting }],
  });
  return {
    session: publicSessionPayload(session),
    assistantMessage: greeting,
    needs: session.needs,
    paymentReady: false,
    nextAction: "collect_items",
  };
}

export async function handleOrderingMessage(input: { tenantSlug: string; sessionId?: string; message: string }) {
  const tenant = await resolveTenant(input.tenantSlug);
  const menuItems = await getMenu(tenant);
  const query: FilterQuery<unknown> = input.sessionId
    ? { _id: input.sessionId, tenantId: tenant._id }
    : { tenantId: tenant._id, tenantSlug: tenant.slug, status: "active" };

  const existing = await ChatSession.findOne(query).sort({ createdAt: -1 });
  const start = existing ? null : await startOrderingSession(input.tenantSlug);
  const session = existing ?? (await ChatSession.findById(start?.session?.id));
  if (!session) throw new AppError(500, "Unable to start order session.", "CHAT_SESSION_CREATE_FAILED");

  const { added, unavailable, ambiguous } = matchMenuItems(input.message, menuItems);
  const fulfilment = detectFulfilment(input.message) ?? session.fulfilmentType;
  const customerPatch = detectCustomerPatch(input.message, fulfilment);
  const items = mergeDraftItems(session.items as DraftItem[], added);
  const customer = {
    ...(session.customer ?? {}),
    ...(customerPatch.phone ? { phone: customerPatch.phone } : {}),
    ...(customerPatch.address ? { address: customerPatch.address } : {}),
  };
  const priced = await priceDraft({ tenant, items, fulfilmentType: fulfilment, customer: customer as { address?: string } });
  const resolvedCustomer = { ...customer, ...(priced.customerPatch ?? {}) };
  const needs = computeNeeds({
    items,
    fulfilmentType: fulfilment,
    customer: resolvedCustomer as { name?: string; phone?: string; email?: string; address?: string },
  });
  const reply = assistantMessage({
    tenant,
    added,
    unavailable,
    ambiguous,
    needs,
    total: priced.pricing?.totalPayable,
  });

  session.items = priced.items as never;
  session.fulfilmentType = fulfilment ?? undefined;
  session.customer = resolvedCustomer as never;
  session.pricing = (priced.pricing ?? session.pricing) as never;
  session.needs = needs;
  session.status = needs.length === 0 ? "ready_for_payment" : "active";
  session.lastAssistantMessage = reply;
  session.messages.push({ role: "user", content: input.message });
  session.messages.push({ role: "assistant", content: reply, metadata: { added, unavailable, ambiguous, needs } });
  await session.save();

  return {
    session: publicSessionPayload(session),
    assistantMessage: reply,
    reply,
    addedItems: added,
    unavailableItems: unavailable,
    ambiguousItems: ambiguous,
    needs,
    paymentReady: needs.length === 0,
    nextAction: needs.length === 0 ? "confirm_order" : needs[0],
  };
}

export async function createOrderFromSession(input: { tenantSlug: string; sessionId: string; customer?: Record<string, unknown> }) {
  const tenant = await resolveTenant(input.tenantSlug);
  const session = await ChatSession.findOne({ _id: input.sessionId, tenantId: tenant._id });
  if (!session) throw new AppError(404, "Order session not found.", "CHAT_SESSION_NOT_FOUND");

  const customer = { ...(session.customer ?? {}), ...(input.customer ?? {}) };
  const needs = computeNeeds({
    items: session.items as DraftItem[],
    fulfilmentType: session.fulfilmentType as "pickup" | "delivery" | null,
    customer: customer as { name?: string; phone?: string; email?: string; address?: string },
  });
  if (needs.length) throw new AppError(422, "Order is not ready yet.", "ORDER_DRAFT_INCOMPLETE", { needs });

  const priced = await priceDraft({
    tenant,
    items: session.items as DraftItem[],
    fulfilmentType: session.fulfilmentType as "pickup" | "delivery",
    customer: customer as { address?: string },
  });
  const statusToken = randomBytes(18).toString("hex");
  const statusTokenHash = createHash("sha256").update(statusToken).digest("hex");
  const order = await Order.create({
    tenantId: tenantId(tenant),
    source: "chat",
    status: "PRICED",
    customer: { ...customer, ...(priced.customerPatch ?? {}) },
    fulfilmentType: session.fulfilmentType,
    items: priced.items,
    pricing: priced.pricing,
    publicStatusTokenHash: statusTokenHash,
  });

  session.orderId = order._id;
  session.status = "converted";
  await session.save();

  return { order, statusToken, statusUrl: `/order/${tenant.slug}/status/${order.id}?token=${statusToken}` };
}

export async function createPublicPaymentLink(input: { tenantSlug: string; orderId: string; statusToken?: string }) {
  const tenant = await resolveTenant(input.tenantSlug);
  const order = await Order.findOne({ _id: input.orderId, tenantId: tenant._id });
  if (!order) throw new AppError(404, "Order not found.", "ORDER_NOT_FOUND");
  if (order.status !== "PRICED" && order.status !== "PENDING_PAYMENT") {
    throw new AppError(409, "Order is not ready for payment.", "ORDER_NOT_PAYMENT_READY");
  }

  const reference = order.payment?.reference ?? createReference("CHOWCALL");
  const provider = getPaymentProvider(tenant.payment?.provider);
  const amount = order.pricing?.totalPayable ?? 0;
  const link = await provider.createPaymentLink({
    amount,
    email: order.customer?.email ?? undefined,
    phone: order.customer?.phone ?? undefined,
    reference,
    metadata: { orderId: order.id, tenantId: tenantId(tenant), source: "ai_chat" },
  });

  const payment =
    (await Payment.findOne({ reference: link.reference })) ??
    (await Payment.create({
      tenantId: tenantId(tenant),
      orderId: order.id,
      provider: link.provider,
      reference: link.reference,
      amount,
      authorizationUrl: link.authorizationUrl,
    }));

  order.status = "PENDING_PAYMENT";
  order.payment = {
    provider: link.provider,
    reference: link.reference,
    authorizationUrl: link.authorizationUrl,
    expiresAt: new Date(Date.now() + env.PAYMENT_EXPIRY_MINUTES * 60_000),
  };
  await order.save();

  if (order.customer?.phone) {
    await twilioSmsProvider
      .send({
        to: order.customer.phone,
        channel: "sms",
        body: `Your ${tenant.name} ChowCall payment link: ${link.authorizationUrl}`,
      })
      .catch(() => undefined);
  }

  return {
    payment,
    order,
    authorizationUrl: link.authorizationUrl,
    statusUrl: `/order/${tenant.slug}/status/${order.id}${input.statusToken ? `?token=${input.statusToken}` : ""}`,
  };
}

export function verifyPublicOrderAccess(order: {
  publicStatusTokenHash?: string | null;
  customer?: { phone?: string | null };
}, input: { token?: string; phone?: string }) {
  if (!order.publicStatusTokenHash) return true;
  if (input.token) {
    const hash = createHash("sha256").update(input.token).digest("hex");
    if (hash === order.publicStatusTokenHash) return true;
  }
  const expected = order.customer?.phone?.replace(/\D/g, "");
  const received = input.phone?.replace(/\D/g, "");
  return Boolean(expected && received && expected.endsWith(received.slice(-10)));
}
