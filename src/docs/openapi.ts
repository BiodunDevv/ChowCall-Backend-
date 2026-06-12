const bearerSecurity = [{ bearerAuth: [] }];
const publicSecurity: [] = [];

const ok = (description = "Success") => ({ "200": { description } });
const created = (description = "Created") => ({ "201": { description } });
const accepted = (description = "Accepted") => ({ "202": { description } });
const noContent = (description = "No content") => ({ "204": { description } });

const placeholderGet = (tag: string, summary: string) => ({
  get: {
    tags: [tag],
    summary,
    responses: ok(`${tag} module status and scaffold metadata.`),
  },
});

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "ChowCall API",
    version: "1.0.0",
    description:
      "AI voice ordering, delivery fee, service fee, payment, SMS notification, and kitchen ticket automation API for Nigerian restaurants.",
  },
  servers: [{ url: "http://localhost:4000", description: "Local" }],
  tags: [
    "Welcome",
    "Health",
    "Auth",
    "Users",
    "Tenants",
    "Staff",
    "Menu",
    "Inventory",
    "Delivery Pricing",
    "Service Fees",
    "Pricing",
    "Orders",
    "Payments",
    "Calls",
    "Voice",
    "Notifications",
    "Maps",
    "Analytics",
    "Billing",
    "Escalations",
    "Public Ordering",
  ].map((name) => ({ name })),
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" },
            },
          },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["name", "email", "password", "restaurantName", "restaurantSlug"],
        properties: {
          name: { type: "string", example: "Amina Bello" },
          email: { type: "string", format: "email", example: "owner@chowcall.ng" },
          password: { type: "string", format: "password", example: "StrongPassword123" },
          restaurantName: { type: "string", example: "ChowCall Kitchen" },
          restaurantSlug: { type: "string", example: "chowcall-kitchen" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "owner@chowcall.ng" },
          password: { type: "string", format: "password", example: "StrongPassword123" },
        },
      },
      SmsTestRequest: {
        type: "object",
        required: ["phone"],
        properties: {
          phone: { type: "string", example: "08031234567" },
          message: {
            type: "string",
            example: "Your ChowCall Twilio SMS test is working.",
          },
        },
      },
      MenuItemRequest: {
        type: "object",
        required: ["name", "category", "basePrice"],
        properties: {
          name: { type: "string", example: "Jollof Rice Combo" },
          category: { type: "string", example: "Rice" },
          description: { type: "string", example: "Party jollof, chicken, plantain, and coleslaw." },
          basePrice: { type: "number", example: 4500 },
          available: { type: "boolean", example: true },
        },
      },
      MoneyBreakdown: {
        type: "object",
        properties: {
          itemSubtotal: { type: "number", example: 9500 },
          deliveryFee: { type: "number", example: 2700 },
          serviceFee: { type: "number", example: 475 },
          discount: { type: "number", example: 0 },
          totalPayable: { type: "number", example: 12675 },
        },
      },
      PricingQuoteRequest: {
        type: "object",
        required: ["tenantId", "customerAddress", "items"],
        properties: {
          tenantId: { type: "string", example: "665f2ef8935f20ddc39c1111" },
          customerAddress: { type: "string", example: "12 Admiralty Way, Lekki Phase 1, Lagos" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", example: "Jollof Rice Combo" },
                quantity: { type: "number", example: 2 },
                unitPrice: { type: "number", example: 4500 },
              },
            },
          },
        },
      },
      OrderCreateRequest: {
        type: "object",
        required: ["customer", "items"],
        properties: {
          source: { type: "string", example: "dashboard" },
          fulfilmentType: { type: "string", example: "delivery" },
          distanceKm: { type: "number", example: 6.2 },
          customer: {
            type: "object",
            properties: {
              name: { type: "string", example: "Tola Ade" },
              phone: { type: "string", example: "08031234567" },
              email: { type: "string", format: "email", example: "customer@example.com" },
              address: { type: "string", example: "12 Admiralty Way, Lekki Phase 1, Lagos" },
            },
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", example: "Jollof Rice Combo" },
                quantity: { type: "number", example: 2 },
                unitPrice: { type: "number", example: 4500 },
              },
            },
          },
        },
      },
      PaymentLinkRequest: {
        type: "object",
        required: ["orderId"],
        properties: {
          orderId: { type: "string" },
          email: { type: "string", format: "email", example: "customer@example.com" },
        },
      },
      StatusUpdateRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            example: "confirmed",
            enum: [
              "draft",
              "priced",
              "payment_pending",
              "confirmed",
              "kitchen_sent",
              "preparing",
              "ready",
              "delivery",
              "completed",
              "expired",
              "cancelled",
              "escalated",
            ],
          },
        },
      },
      StaffInviteRequest: {
        type: "object",
        required: ["name", "email", "roles"],
        properties: {
          name: { type: "string", example: "Kitchen Lead" },
          email: { type: "string", format: "email", example: "kitchen@chowcall.ng" },
          phone: { type: "string", example: "08031234567" },
          roles: {
            type: "array",
            items: { type: "string", example: "kitchen_staff" },
          },
        },
      },
      DeliveryPricingUpdateRequest: {
        type: "object",
        properties: {
          baseFee: { type: "number", example: 700 },
          perKmRate: { type: "number", example: 250 },
          minimumDeliveryFee: { type: "number", example: 1000 },
          maximumDeliveryFee: { type: "number", example: 5000 },
          maxDeliveryRadiusKm: { type: "number", example: 15 },
          roundingRule: { type: "string", example: "nearest_100" },
          freeDelivery: {
            type: "object",
            properties: {
              enabled: { type: "boolean", example: true },
              minimumOrderSubtotal: { type: "number", example: 20000 },
              maxDistanceKm: { type: "number", example: 5 },
            },
          },
        },
      },
      ServiceFeeUpdateRequest: {
        type: "object",
        properties: {
          enabled: { type: "boolean", example: true },
          mode: { type: "string", example: "hybrid" },
          percentage: { type: "number", example: 5 },
          flatFee: { type: "number", example: 100 },
          minimumFee: { type: "number", example: 200 },
          maximumFee: { type: "number", example: 1500 },
        },
      },
      InventoryAvailabilityRequest: {
        type: "object",
        required: ["available"],
        properties: {
          available: { type: "boolean", example: false },
          reason: { type: "string", example: "Sold out after lunch rush" },
          resetAt: { type: "string", format: "date-time" },
        },
      },
      UsageEventRequest: {
        type: "object",
        required: ["type", "quantity"],
        properties: {
          type: { type: "string", example: "sms" },
          quantity: { type: "number", example: 1 },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      EscalationCreateRequest: {
        type: "object",
        required: ["reason"],
        properties: {
          orderId: { type: "string" },
          callSessionId: { type: "string", example: "call_123" },
          reason: { type: "string", example: "Customer address is outside delivery radius" },
          priority: { type: "string", example: "high" },
          prompt: { type: "string", example: "Approve special delivery fee?" },
          timeoutSeconds: { type: "number", example: 120 },
        },
      },
    },
  },
  security: bearerSecurity,
  paths: {
    "/": {
      get: {
        tags: ["Welcome"],
        security: publicSecurity,
        summary: "Render the ChowCall backend welcome page.",
        responses: { "200": { description: "HTML welcome page" } },
      },
    },
    "/health": {
      get: {
        tags: ["Health"],
        security: publicSecurity,
        responses: ok("API health"),
      },
    },
    "/v1/health": {
      get: {
        tags: ["Health"],
        security: publicSecurity,
        responses: ok("Versioned API health"),
      },
    },
    "/v1/auth/register": {
      post: {
        tags: ["Auth"],
        security: publicSecurity,
        summary: "Register a tenant owner and initial restaurant tenant.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } } },
        },
        responses: created(),
      },
    },
    "/v1/auth/login": {
      post: {
        tags: ["Auth"],
        security: publicSecurity,
        summary: "Login and receive access and refresh tokens.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } },
        },
        responses: ok("Authenticated"),
      },
    },
    "/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        security: publicSecurity,
        summary: "Refresh an access token.",
        responses: ok("Token refreshed"),
      },
    },
    "/v1/auth/logout": {
      post: { tags: ["Auth"], summary: "Revoke the current refresh token.", responses: noContent() },
    },
    "/v1/auth/me": {
      get: { tags: ["Auth"], summary: "Return the current authenticated user.", responses: ok("Current user") },
    },
    "/v1/users": {
      get: {
        tags: ["Users"],
        summary: "List platform users. Platform roles only.",
        responses: ok("Users"),
      },
    },
    "/v1/users/me": {
      get: { tags: ["Users"], summary: "Return the current user profile.", responses: ok("Current user") },
    },
    "/v1/users/tenant": {
      get: { tags: ["Users"], summary: "List active users in the current tenant.", responses: ok("Tenant users") },
    },
    "/v1/tenants": placeholderGet("Tenants", "Manage restaurant tenants and onboarding."),
    "/v1/staff": {
      get: { tags: ["Staff"], summary: "List current tenant staff.", responses: ok("Tenant staff") },
    },
    "/v1/staff/invite": {
      post: {
        tags: ["Staff"],
        summary: "Invite or reactivate a staff member for the current tenant.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/StaffInviteRequest" } } },
        },
        responses: created("Staff invited"),
      },
    },
    "/v1/staff/{userId}/roles": {
      patch: {
        tags: ["Staff"],
        summary: "Update a staff member's tenant roles.",
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["roles"],
                properties: { roles: { type: "array", items: { type: "string" } } },
              },
            },
          },
        },
        responses: ok("Staff roles updated"),
      },
    },
    "/v1/staff/{userId}/disable": {
      patch: {
        tags: ["Staff"],
        summary: "Disable a staff member in the current tenant.",
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: ok("Staff disabled"),
      },
    },
    "/v1/menu": {
      get: { tags: ["Menu"], summary: "List tenant menu items.", responses: ok("Menu items") },
      post: {
        tags: ["Menu"],
        summary: "Create a tenant menu item.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/MenuItemRequest" } } },
        },
        responses: created("Menu item created"),
      },
    },
    "/v1/menu/{id}": {
      patch: {
        tags: ["Menu"],
        summary: "Update a tenant menu item.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/MenuItemRequest" } } } },
        responses: ok("Menu item updated"),
      },
      delete: {
        tags: ["Menu"],
        summary: "Delete a tenant menu item.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: noContent(),
      },
    },
    "/v1/inventory": {
      get: {
        tags: ["Inventory"],
        summary: "List menu inventory availability for the current tenant.",
        responses: ok("Inventory"),
      },
    },
    "/v1/inventory/items/{id}/availability": {
      patch: {
        tags: ["Inventory"],
        summary: "Mark an item sold out or available and write an inventory log.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/InventoryAvailabilityRequest" } },
          },
        },
        responses: ok("Availability updated"),
      },
    },
    "/v1/inventory/commands/whatsapp": {
      post: {
        tags: ["Inventory"],
        summary: "Parse a future WhatsApp inventory command.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["from", "text"],
                properties: {
                  from: { type: "string", example: "08031234567" },
                  text: { type: "string", example: "sold out jollof rice" },
                },
              },
            },
          },
        },
        responses: ok("Command parsed"),
      },
    },
    "/v1/delivery-pricing": {
      get: { tags: ["Delivery Pricing"], summary: "Get tenant delivery pricing config.", responses: ok() },
      patch: {
        tags: ["Delivery Pricing"],
        summary: "Update tenant delivery pricing config.",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/DeliveryPricingUpdateRequest" } },
          },
        },
        responses: ok("Delivery pricing updated"),
      },
    },
    "/v1/delivery-pricing/preview": {
      post: {
        tags: ["Delivery Pricing"],
        summary: "Preview delivery fee from the current tenant config.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["itemSubtotal"],
                properties: {
                  fulfilmentType: { type: "string", example: "delivery" },
                  distanceKm: { type: "number", example: 6.2 },
                  itemSubtotal: { type: "number", example: 12000 },
                  zoneName: { type: "string", example: "Lekki Phase 1" },
                },
              },
            },
          },
        },
        responses: ok("Delivery fee preview"),
      },
    },
    "/v1/service-fees": {
      get: { tags: ["Service Fees"], summary: "Get tenant service fee config.", responses: ok() },
      patch: {
        tags: ["Service Fees"],
        summary: "Update tenant service fee config.",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ServiceFeeUpdateRequest" } },
          },
        },
        responses: ok("Service fee updated"),
      },
    },
    "/v1/service-fees/preview": {
      post: {
        tags: ["Service Fees"],
        summary: "Preview service fee from the current tenant config.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["itemSubtotal", "itemCount"],
                properties: {
                  itemSubtotal: { type: "number", example: 12000 },
                  itemCount: { type: "number", example: 3 },
                },
              },
            },
          },
        },
        responses: ok("Service fee preview"),
      },
    },
    "/v1/pricing/quote": {
      post: {
        tags: ["Pricing"],
        summary: "Quote delivery, service fees, and total payable for an order.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/PricingQuoteRequest" } } },
        },
        responses: ok("Pricing quote"),
      },
    },
    "/v1/orders": {
      get: { tags: ["Orders"], summary: "List tenant orders.", responses: ok("Orders") },
      post: {
        tags: ["Orders"],
        summary: "Create a draft order.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/OrderCreateRequest" } } },
        },
        responses: created("Order created"),
      },
    },
    "/v1/orders/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Get one tenant order.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: ok("Order"),
      },
    },
    "/v1/orders/{id}/status": {
      patch: {
        tags: ["Orders"],
        summary: "Move an order through the v1 lifecycle.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/StatusUpdateRequest" } } },
        },
        responses: ok("Order status updated"),
      },
    },
    "/v1/payments": placeholderGet("Payments", "Inspect payment status and provider metadata."),
    "/v1/payments/links": {
      post: {
        tags: ["Payments"],
        summary: "Create a payment link for a priced tenant order.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentLinkRequest" } } },
        },
        responses: created("Payment link created"),
      },
    },
    "/v1/payments/{reference}/verify": {
      get: {
        tags: ["Payments"],
        summary: "Verify a payment reference and confirm the order when paid.",
        parameters: [{ name: "reference", in: "path", required: true, schema: { type: "string" } }],
        responses: ok("Payment verification result"),
      },
    },
    "/v1/payments/webhooks/paystack": {
      post: {
        tags: ["Payments"],
        security: publicSecurity,
        summary: "Paystack payment webhook with signature verification and idempotency.",
        responses: ok("Webhook accepted"),
      },
    },
    "/v1/calls": placeholderGet("Calls", "Future phone-routing support. Web AI voice ordering is the active customer channel."),
    "/v1/voice": placeholderGet("Voice", "Web AI voice token, voice options, and future phone-routing scaffold."),
    "/v1/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "Show active notification providers.",
        responses: ok("Notification providers"),
      },
    },
    "/v1/notifications/test-sms": {
      post: {
        tags: ["Notifications"],
        security: publicSecurity,
        summary: "Send a test SMS through Twilio.",
        description:
          "Use this from Swagger to verify Twilio SMS credentials. Nigerian local numbers are normalized to +234.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SmsTestRequest" } } },
        },
        responses: accepted("SMS queued or sent"),
      },
    },
    "/v1/maps": placeholderGet("Maps", "Geocode and distance provider status."),
    "/v1/maps/quote-distance": {
      post: {
        tags: ["Maps"],
        summary: "Resolve normalized distance for delivery pricing.",
        responses: ok("Distance quote"),
      },
    },
    "/v1/analytics": {
      get: {
        tags: ["Analytics"],
        summary: "Show analytics module status and available endpoints.",
        responses: ok("Analytics module status"),
      },
    },
    "/v1/analytics/summary": {
      get: {
        tags: ["Analytics"],
        summary: "Aggregate order and paid payment analytics for the current tenant.",
        responses: ok("Analytics summary"),
      },
    },
    "/v1/billing": {
      get: {
        tags: ["Billing"],
        summary: "Return billing plan and aggregate usage for the current tenant.",
        responses: ok("Billing usage"),
      },
    },
    "/v1/billing/usage-events": {
      post: {
        tags: ["Billing"],
        summary: "Record a tenant usage event.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UsageEventRequest" } } },
        },
        responses: created("Usage event recorded"),
      },
    },
    "/v1/escalations": {
      get: {
        tags: ["Escalations"],
        summary: "List live-confirm and manager escalations.",
        responses: ok("Escalations"),
      },
      post: {
        tags: ["Escalations"],
        summary: "Create a live-confirm escalation.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/EscalationCreateRequest" } } },
        },
        responses: created("Escalation created"),
      },
    },
    "/v1/escalations/{id}/resolve": {
      patch: {
        tags: ["Escalations"],
        summary: "Resolve a pending escalation.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["resolution"],
                properties: {
                  resolution: { type: "string", example: "Approved delivery with manual fee." },
                  decision: { type: "string", example: "approved" },
                },
              },
            },
          },
        },
        responses: ok("Escalation resolved"),
      },
    },
    "/v1/public-ordering/{tenantSlug}/menu": {
      get: {
        tags: ["Public Ordering"],
        security: publicSecurity,
        summary: "Fetch the public menu for a tenant.",
        parameters: [{ name: "tenantSlug", in: "path", required: true, schema: { type: "string" } }],
        responses: ok("Public menu"),
      },
    },
    "/v1/public-ordering/{tenantSlug}/chat/session": {
      post: {
        tags: ["Public Ordering"],
        security: publicSecurity,
        summary: "Start a backend AI ordering session for customer web voice ordering.",
        parameters: [{ name: "tenantSlug", in: "path", required: true, schema: { type: "string" } }],
        responses: created("AI ordering session started"),
      },
    },
    "/v1/public-ordering/{tenantSlug}/chat/message": {
      post: {
        tags: ["Public Ordering"],
        security: publicSecurity,
        summary: "Send a customer message to the shared AI ordering engine.",
        parameters: [{ name: "tenantSlug", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  sessionId: { type: "string" },
                  message: { type: "string", example: "I want 2 jollof rice for delivery" },
                },
              },
            },
          },
        },
        responses: ok("AI ordering engine response"),
      },
    },
    "/v1/public-ordering/{tenantSlug}/quote": {
      post: {
        tags: ["Public Ordering"],
        security: publicSecurity,
        summary: "Quote a public web order using the same pricing engine as voice orders.",
        parameters: [{ name: "tenantSlug", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/PricingQuoteRequest" } } },
        },
        responses: ok("Order quote"),
      },
    },
    "/v1/public-ordering/{tenantSlug}/checkout": {
      post: {
        tags: ["Public Ordering"],
        security: publicSecurity,
        summary: "Create a public order and payment link using tenant pricing rules.",
        parameters: [{ name: "tenantSlug", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/OrderCreateRequest" } } },
        },
        responses: created("Public checkout created"),
      },
    },
    "/v1/public-ordering/{tenantSlug}/orders": {
      post: {
        tags: ["Public Ordering"],
        security: publicSecurity,
        summary: "Create an order from a validated AI ordering session.",
        parameters: [{ name: "tenantSlug", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sessionId"],
                properties: {
                  sessionId: { type: "string" },
                  customer: { type: "object" },
                },
              },
            },
          },
        },
        responses: created("Public AI order created"),
      },
    },
    "/v1/public-ordering/{tenantSlug}/orders/{orderId}/payment-link": {
      post: {
        tags: ["Public Ordering"],
        security: publicSecurity,
        summary: "Create a payment link for a public AI order.",
        parameters: [
          { name: "tenantSlug", in: "path", required: true, schema: { type: "string" } },
          { name: "orderId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { token: { type: "string" } } },
            },
          },
        },
        responses: created("Payment link created"),
      },
    },
    "/v1/public-ordering/{tenantSlug}/orders/{orderId}/status": {
      get: {
        tags: ["Public Ordering"],
        security: publicSecurity,
        summary: "Fetch customer-safe order status by secure token or phone verification.",
        parameters: [
          { name: "tenantSlug", in: "path", required: true, schema: { type: "string" } },
          { name: "orderId", in: "path", required: true, schema: { type: "string" } },
          { name: "token", in: "query", required: false, schema: { type: "string" } },
          { name: "phone", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: ok("Customer-safe order status"),
      },
    },
    "/v1/voice/incoming": {
      post: {
        tags: ["Voice"],
        security: publicSecurity,
        summary: "Future Twilio incoming-call webhook. Phone routing is not part of the active product surface.",
        responses: ok("TwiML response"),
      },
    },
    "/v1/voice/web-token": {
      post: {
        tags: ["Voice"],
        security: publicSecurity,
        summary: "Create a short-lived Azure Speech token for browser AI voice ordering.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  tenantSlug: { type: "string", example: "mamaskitchen" },
                },
              },
            },
          },
        },
        responses: ok("Azure Speech token metadata"),
      },
    },
    "/v1/voice/voices": {
      get: {
        tags: ["Voice"],
        security: publicSecurity,
        summary: "List allowed Azure neural voices for tenant web voice ordering.",
        responses: ok("Voice options"),
      },
    },
    "/v1/voice/gather": {
      post: {
        tags: ["Voice"],
        security: publicSecurity,
        summary: "Future Twilio gather webhook that sends transcript text to the shared ordering engine.",
        responses: ok("TwiML response"),
      },
    },
    "/v1/voice/status": {
      post: {
        tags: ["Voice"],
        security: publicSecurity,
        summary: "Twilio call status callback.",
        responses: ok("Status callback accepted"),
      },
    },
    "/v1/voice/recording": {
      post: {
        tags: ["Voice"],
        security: publicSecurity,
        summary: "Twilio recording callback scaffold.",
        responses: ok("Recording callback accepted"),
      },
    },
  },
};
