import { describe, expect, it } from "vitest";
import {
  dailySummaryEmail,
  kitchenTicketEmail,
  onboardingChecklistEmail,
  paymentLinkEmail,
  staffInviteEmail,
  welcomeTenantEmail,
} from "../src/providers/email/templates/index.js";

describe("email templates", () => {
  it("renders responsive ChowCall branded auth and tenant templates", () => {
    const welcome = welcomeTenantEmail({
      name: "Ada",
      tenantName: "ChowCall Kitchen Demo",
      dashboardUrl: "https://app.chowcall.ng",
    });
    const invite = staffInviteEmail({
      inviterName: "Ada",
      tenantName: "ChowCall Kitchen Demo",
      role: "kitchen staff",
      inviteUrl: "https://app.chowcall.ng/invite",
    });
    const summary = dailySummaryEmail({
      tenantName: "ChowCall Kitchen Demo",
      paidOrders: "12",
      revenue: "₦120,000",
      missedCalls: "2",
      dashboardUrl: "https://app.chowcall.ng",
    });

    expect(welcome).toContain("ChowCall");
    expect(welcome).toContain("viewport");
    expect(invite).toContain("kitchen staff");
    expect(summary).toContain("₦120,000");
  });

  it("renders order and onboarding scenarios", () => {
    const payment = paymentLinkEmail({
      tenantName: "ChowCall Kitchen Demo",
      paymentUrl: "https://pay.chowcall.ng/demo",
      expiresIn: "15 minutes",
      money: {
        subtotal: "₦9,500",
        deliveryFee: "₦2,700",
        serviceFee: "₦475",
        total: "₦12,675",
      },
    });
    const ticket = kitchenTicketEmail({
      tenantName: "ChowCall Kitchen Demo",
      orderNumber: "CC-1048",
      fulfilmentType: "Delivery",
      customerPhone: "08012345678",
      address: "Lekki Phase 1",
      itemsSummary: "2x Jollof Rice + Chicken",
      money: {
        subtotal: "₦9,500",
        deliveryFee: "₦2,700",
        serviceFee: "₦475",
        total: "₦12,675",
      },
    });
    const onboarding = onboardingChecklistEmail({
      tenantName: "ChowCall Kitchen Demo",
      dashboardUrl: "https://app.chowcall.ng/setup",
      remainingSteps: ["Add menu", "Connect Paystack"],
    });

    expect(payment).toContain("Pay now");
    expect(ticket).toContain("Kitchen ticket");
    expect(onboarding).toContain("Connect Paystack");
  });
});
