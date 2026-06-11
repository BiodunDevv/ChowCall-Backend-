import { renderEmailLayout } from "./partials/layout.js";

type OrderMoney = {
  subtotal: string;
  deliveryFee: string;
  serviceFee: string;
  total: string;
};

export function paymentLinkEmail(input: {
  customerName?: string;
  tenantName: string;
  paymentUrl: string;
  expiresIn: string;
  money: OrderMoney;
}) {
  return renderEmailLayout({
    previewText: `Complete your ${input.tenantName} order payment.`,
    eyebrow: "Payment required",
    title: `Complete your order${input.customerName ? `, ${input.customerName}` : ""}`,
    body: `Your order from ${input.tenantName} is ready for payment.\nKitchen ticket will be sent after payment is confirmed.`,
    details: [
      { label: "Food subtotal", value: input.money.subtotal },
      { label: "Delivery fee", value: input.money.deliveryFee },
      { label: "Service fee", value: input.money.serviceFee },
      { label: "Total payable", value: input.money.total },
      { label: "Payment expires", value: input.expiresIn },
    ],
    action: { label: "Pay now", href: input.paymentUrl },
  });
}

export function paymentConfirmedEmail(input: {
  tenantName: string;
  orderNumber: string;
  total: string;
}) {
  return renderEmailLayout({
    previewText: `Payment confirmed for ${input.orderNumber}.`,
    eyebrow: "Payment confirmed",
    title: "Your order is confirmed",
    body: `${input.tenantName} has received your payment. The kitchen has been notified and your order is being processed.`,
    details: [
      { label: "Order ID", value: input.orderNumber },
      { label: "Total paid", value: input.total },
    ],
  });
}

export function paymentExpiryReminderEmail(input: {
  tenantName: string;
  paymentUrl: string;
  expiresIn: string;
}) {
  return renderEmailLayout({
    previewText: `Your ${input.tenantName} payment link expires soon.`,
    eyebrow: "Reminder",
    title: "Your payment link expires soon",
    body: `Your ${input.tenantName} order is still waiting for payment.\nComplete payment before it expires so the kitchen can receive your ticket.`,
    details: [{ label: "Expires in", value: input.expiresIn }],
    action: { label: "Complete payment", href: input.paymentUrl },
  });
}

export function kitchenTicketEmail(input: {
  tenantName: string;
  orderNumber: string;
  fulfilmentType: string;
  customerPhone: string;
  address?: string;
  itemsSummary: string;
  money: OrderMoney;
}) {
  return renderEmailLayout({
    previewText: `Paid kitchen ticket for ${input.orderNumber}.`,
    eyebrow: "Paid order",
    title: "Kitchen ticket",
    body: `A paid order is ready for ${input.tenantName}.\n${input.itemsSummary}`,
    details: [
      { label: "Order ID", value: input.orderNumber },
      { label: "Fulfilment", value: input.fulfilmentType },
      { label: "Customer phone", value: input.customerPhone },
      ...(input.address ? [{ label: "Address", value: input.address }] : []),
      { label: "Food subtotal", value: input.money.subtotal },
      { label: "Delivery fee", value: input.money.deliveryFee },
      { label: "Service fee", value: input.money.serviceFee },
      { label: "Total paid", value: input.money.total },
    ],
  });
}
