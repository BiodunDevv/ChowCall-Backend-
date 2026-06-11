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

## Shared AI Ordering Engine

`src/v1/ai-ordering` is the shared server-side ordering core for public chat and Twilio voice calls.

It owns:

- tenant lookup by path-based `tenantSlug`
- chat and voice session state
- menu item matching and sold-out checks
- order draft updates
- pickup/delivery/customer detail requirements
- Mapbox-backed delivery distance where a tenant map pin and customer address are available
- server-side pricing recalculation
- payment-link readiness
- public status-token verification
- kitchen-ticket send tracking

The frontend can assist with UX, but payment creation is blocked until the backend draft has valid items, fulfilment type, customer phone/name, delivery address for delivery, and recalculated totals.

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
- Backend-driven public AI chat sessions and messages.
- Public order creation from a validated AI draft.
- Secure public order status by token or phone verification.
- Payment link creation for tenant orders.
- Paystack webhook verification, idempotent payment confirmation, `PAID` order status, and kitchen-ticket dispatch.
- Twilio SMS test endpoint.
- Twilio gather-mode voice ordering endpoints that call the same AI ordering engine.

Next implementation priorities:

- Azure OpenAI tool-call enrichment for deeper natural language parsing.
- Media Streams realtime voice once speech credentials and stream URLs are ready.
- Menu import and AI-assisted menu extraction.
- Redis-backed draft order and active call state.

## Auth and Onboarding

- Registration remains intentionally short and creates the tenant owner plus initial restaurant workspace.
- Tenant slugs are generated server-side and made unique.
- Access and refresh sessions use HTTP-only cookies while bearer tokens remain available for Swagger.
- Refresh tokens rotate and logout revokes the stored refresh token.
- `/v1/onboarding` persists setup steps and exposes readiness checks before go-live.
