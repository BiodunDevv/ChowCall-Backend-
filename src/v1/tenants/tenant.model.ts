import { model, Schema } from "mongoose";

const deliveryPricingSchema = new Schema(
  {
    mode: { type: String, enum: ["distance", "zone"], default: "distance" },
    baseFee: { type: Number, default: 700 },
    perKmRate: { type: Number, default: 250 },
    minimumDeliveryFee: { type: Number, default: 1000 },
    maximumDeliveryFee: { type: Number, default: 5000 },
    maxDeliveryRadiusKm: { type: Number, default: 15 },
    roundingRule: { type: String, default: "nearest_100" },
    freeDelivery: {
      enabled: { type: Boolean, default: false },
      minimumOrderSubtotal: Number,
      maxDistanceKm: Number,
    },
    surgeRules: [{ name: String, enabled: Boolean, multiplier: Number }],
    zoneOverrides: [{ name: String, aliases: [String], fee: Number }],
    outOfZoneBehavior: { type: String, default: "live_confirm" },
  },
  { _id: false }
);

const serviceFeeSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    mode: { type: String, default: "percentage" },
    percentage: { type: Number, default: 5 },
    flatFee: { type: Number, default: 0 },
    minimumFee: { type: Number, default: 200 },
    maximumFee: { type: Number, default: 1500 },
    smallOrderFee: {
      enabled: { type: Boolean, default: true },
      threshold: { type: Number, default: 5000 },
      fee: { type: Number, default: 500 },
    },
    packagingFee: { enabled: { type: Boolean, default: false }, feePerItem: Number },
    appliesTo: { type: String, enum: ["pickup", "delivery", "both"], default: "both" },
  },
  { _id: false }
);

const tenantSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    phone: String,
    address: String,
    mapPin: { lat: Number, lng: Number },
    openingHours: { type: Schema.Types.Mixed, default: {} },
    kitchenWhatsAppNumber: String,
    escalationContacts: [{ name: String, phone: String, email: String }],
    payment: {
      provider: { type: String, enum: ["paystack", "flutterwave"], default: "paystack" },
      payOnDeliveryEnabled: { type: Boolean, default: false },
      expiryMinutes: { type: Number, default: 15 },
    },
    voice: {
      greeting: { type: String, default: "Hello, thank you for calling. What would you like to order?" },
      routingNumber: String,
      dedicatedNumber: String,
      callerIdTestStatus: { type: String, enum: ["not_tested", "passed", "missing", "inconsistent"], default: "not_tested" },
    },
    onboarding: {
      status: { type: String, enum: ["draft", "testing", "live"], default: "draft" },
      checks: { type: Map, of: Boolean, default: {} },
      completedSteps: [{ type: String }],
      currentStep: { type: String, default: "profile" },
      stepData: { type: Schema.Types.Mixed, default: {} },
      readinessFailures: [{ type: String }],
      updatedAt: Date,
    },
    deliveryPricing: { type: deliveryPricingSchema, default: {} },
    serviceFee: { type: serviceFeeSchema, default: {} },
    aiAgent: {
      enabled: { type: Boolean, default: true },
      instructions: { type: String, default: "" },
    },
    coverImageUrl: { type: String },
    heroHeadline: { type: String },
    description: { type: String },
    category: { type: String },
    instagramUrl: { type: String },
    twitterUrl: { type: String },
    facebookUrl: { type: String },
    tiktokUrl: { type: String },
    websiteUrl: { type: String },
    whatsappNumber: { type: String },
    bannerText: { type: String },
    bannerEnabled: { type: Boolean, default: false },
    showPopularItems: { type: Boolean, default: true },
    pickupEnabled: { type: Boolean, default: true },
    deliveryEnabled: { type: Boolean, default: true },
    estimatedPrepTime: { type: Number },
    billingPlan: { type: String, enum: ["starter", "growth", "pro", "enterprise"], default: "starter" },
    logo: { type: String },
    subscriptionStatus: { type: String, enum: ["trial", "active", "unpaid", "cancelled"], default: "unpaid" },
    subscribedPlan: { type: String, enum: ["starter", "growth", "pro", "enterprise"], default: null },
    subscriptionExpiresAt: Date,
  },
  { timestamps: true }
);

export const Tenant = model("Tenant", tenantSchema);
