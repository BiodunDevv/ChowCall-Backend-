import { twilioSmsProvider } from "../../providers/messaging/twilio-sms.provider.js";
import { Message } from "../notifications/message.model.js";
import { Order } from "../orders/order.model.js";
import { Tenant } from "../tenants/tenant.model.js";
import { KitchenTicket } from "./kitchen-ticket.model.js";

function money(value = 0) {
  return `NGN ${Math.round(value).toLocaleString("en-NG")}`;
}

function buildKitchenTicketBody(input: {
  tenantName: string;
  orderNumber?: string;
  customer?: { name?: string; phone?: string; address?: string; landmark?: string };
  fulfilmentType?: string;
  items?: Array<{ name?: string; quantity?: number; notes?: string; lineTotal?: number }>;
  total?: number;
}) {
  const items = (input.items ?? [])
    .map((item) => `- ${item.quantity ?? 1}x ${item.name ?? "Item"}${item.notes ? ` (${item.notes})` : ""}`)
    .join("\n");

  return [
    `${input.tenantName} kitchen ticket`,
    `Order: ${input.orderNumber ?? "New order"}`,
    `Customer: ${input.customer?.name ?? "Customer"}${input.customer?.phone ? ` (${input.customer.phone})` : ""}`,
    `Fulfilment: ${input.fulfilmentType ?? "pickup"}`,
    input.customer?.address ? `Address: ${input.customer.address}${input.customer.landmark ? `, ${input.customer.landmark}` : ""}` : null,
    "",
    items,
    "",
    `Total: ${money(input.total)}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function sendKitchenTicketForOrder(orderId: string) {
  const order = await Order.findById(orderId);
  if (!order) return null;

  const tenant = await Tenant.findById(order.tenantId).lean();
  if (!tenant) return null;

  const recipient = tenant.kitchenWhatsAppNumber ?? tenant.phone ?? tenant.whatsappNumber ?? "";
  const body = buildKitchenTicketBody({
    tenantName: tenant.name,
    orderNumber: order.orderNumber ?? undefined,
    customer: order.customer
      ? {
          name: order.customer.name ?? undefined,
          phone: order.customer.phone ?? undefined,
          address: order.customer.address ?? undefined,
          landmark: order.customer.landmark ?? undefined,
        }
      : undefined,
    fulfilmentType: order.fulfilmentType ?? undefined,
    items: order.items.map((item) => ({
      name: item.name ?? undefined,
      quantity: item.quantity ?? undefined,
      notes: item.notes ?? undefined,
      lineTotal: item.lineTotal ?? undefined,
    })),
    total: order.pricing?.totalPayable,
  });

  const existing = await KitchenTicket.findOne({ tenantId: order.tenantId, orderId: order._id });
  const ticket =
    existing ??
    (await KitchenTicket.create({
      tenantId: order.tenantId,
      orderId: order._id,
      channel: recipient ? "sms" : "dashboard",
      recipient,
      body,
      status: "pending",
    }));

  ticket.body = body;
  ticket.recipient = recipient;
  ticket.attempts = (ticket.attempts ?? 0) + 1;

  if (!recipient) {
    ticket.channel = "dashboard";
    ticket.status = "sent";
    ticket.sentAt = new Date();
    await ticket.save();
    order.status = "SENT_TO_KITCHEN";
    order.kitchenTicketSentAt = ticket.sentAt;
    await order.save();
    return ticket;
  }

  try {
    const result = await twilioSmsProvider.send({ to: recipient, body, channel: "sms" });
    ticket.channel = "sms";
    ticket.status = result.status === "sent" || result.status === "queued" ? "sent" : "pending";
    ticket.providerMessageId = result.providerMessageId;
    ticket.sentAt = new Date();
    ticket.lastError = undefined;
    await ticket.save();

    await Message.create({
      tenantId: order.tenantId,
      orderId: order._id,
      channel: "sms",
      provider: "twilio",
      recipient,
      messageType: "kitchen_ticket",
      body,
      status: ticket.status,
      providerMessageId: result.providerMessageId,
      rawResponse: result.metadata,
    });

    order.status = "SENT_TO_KITCHEN";
    order.kitchenTicketSentAt = ticket.sentAt;
    await order.save();
  } catch (error) {
    ticket.status = "failed";
    ticket.lastError = error instanceof Error ? { message: error.message } : error;
    await ticket.save();
  }

  return ticket;
}
