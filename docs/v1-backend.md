# ChowCall v1 Backend Notes

## Core Product Rule

Calls in. Paid orders out.

The backend must never send a kitchen ticket before payment confirmation unless the tenant explicitly enables pay-on-delivery.

## Tenant Isolation

Every tenant record must include:

- `tenantId`
- `createdAt`
- `updatedAt`
- `createdBy` where applicable

All tenant endpoints must apply tenant-scoped queries.

## Pricing Engines

Voice orders and public web orders must use the same pricing engine:

```text
totalPayable = itemSubtotal + deliveryFee + serviceFee - discount
```

Delivery pricing is distance-first. Named zones are only overrides or fallbacks.

## Current Provider Choices

- Maps: Mapbox geocoding and driving distance.
- SMS: Twilio for test and transactional SMS.
- Email: Brevo transactional email.
- WhatsApp: disabled until a paid WhatsApp provider is enabled.
- Payments: Paystack provider.

## Implemented v1 Flow

The backend now supports:

- Tenant-scoped menu, inventory, delivery pricing, service fee, staff, analytics, billing, and escalation routes.
- Dashboard order creation with shared pricing logic.
- Public menu, public quote, and public checkout.
- Payment link creation for tenant orders.
- Paystack webhook verification and idempotent payment confirmation.
- Twilio SMS test endpoint.

Next implementation priorities:

- Kitchen ticket dispatch after verified payment.
- Voice call session state and AI tool endpoints.
- Menu import and AI-assisted menu extraction.
- Redis-backed draft order and active call state.

## Auth and Onboarding

- Registration remains intentionally short and creates the tenant owner plus initial restaurant workspace.
- Tenant slugs are generated server-side and made unique.
- Access and refresh sessions use HTTP-only cookies while bearer tokens remain available for Swagger.
- Refresh tokens rotate and logout revokes the stored refresh token.
- `/v1/onboarding` persists setup steps and exposes readiness checks before go-live.
