import "dotenv/config";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { hashPassword } from "../shared/security/password.js";
import { Tenant } from "../v1/tenants/tenant.model.js";
import { User } from "../v1/users/user.model.js";
import { MenuItem } from "../v1/menu/menu-item.model.js";
import { Order } from "../v1/orders/order.model.js";

async function seed() {
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });
  console.log("Connected to MongoDB.");

  await mongoose.connection.dropDatabase();
  console.log("Cleared database.");

  const passwordHash = await hashPassword("123456");

  // 1. Super admin user
  const superAdmin = await User.create({
    name: "ChowCall Admin",
    email: "louisdiaz43@gmail.com",
    passwordHash,
    platformRoles: ["platform_owner"],
    memberships: [],
    twoFaEnabled: false,
  });
  console.log(`Created super admin: ${superAdmin.email}`);

  // 2. Demo tenant: Mama's Kitchen
  const demoTenant = await Tenant.create({
    name: "Mama's Kitchen",
    slug: "mamaskitchen",
    phone: "+2348000000001",
    address: "12 Adeola Odeku Street, Victoria Island, Lagos",
    subscriptionStatus: "active",
    onboarding: { status: "live" },
    aiAgent: {
      enabled: true,
      instructions:
        "Greet customers warmly, answer menu questions clearly, suggest chilled zobo or Chapman with rice meals, and ask one follow-up question when an order is unclear.",
    },
    voice: {
      enabled: true,
      greeting: "Welcome to Mama's Kitchen. What would you like to order today?",
      speechVoiceName: "en-NG-EzinneNeural",
      speechVoiceStyle: "friendly",
      speechLanguage: "en-NG",
    },
    deliveryPricing: {
      mode: "distance",
      baseFee: 700,
      perKmRate: 250,
      minimumDeliveryFee: 1000,
      maximumDeliveryFee: 5000,
      maxDeliveryRadiusKm: 15,
    },
    serviceFee: { enabled: true, mode: "percentage", percentage: 5 },
    billingPlan: "growth",
    // Storefront / public page
    logo: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&auto=format&fit=crop&q=80",
    coverImageUrl: "https://plus.unsplash.com/premium_photo-1661883237884-263e8de8869b?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8aGVybyUyMGJhY2tncm91bmQlMjBmb3IlMjByZXN0YXVyYW50fGVufDB8fDB8fHww",
    heroHeadline: "Order from Mama's Kitchen — fresh, fast & flavourful.",
    description: "Authentic Nigerian home cooking — Jollof Rice, Egusi Soup, Suya and more, delivered fresh.",
    category: "Nigerian Cuisine",
    bannerEnabled: true,
    bannerText: "🎉 Free delivery on orders above ₦10,000 today!",
    whatsappNumber: "+2348000000000",
    instagramUrl: "https://instagram.com/mamaskitchen",
    heroImageLightUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&auto=format&fit=crop&q=80",
    heroImageDarkUrl: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&auto=format&fit=crop&q=80",
    showPopularItems: true,
    pickupEnabled: true,
    deliveryEnabled: true,
    estimatedPrepTime: 25,
    openingHours: {
      monday:    { open: true,  from: "09:00", to: "22:00" },
      tuesday:   { open: true,  from: "09:00", to: "22:00" },
      wednesday: { open: true,  from: "09:00", to: "22:00" },
      thursday:  { open: true,  from: "09:00", to: "22:00" },
      friday:    { open: true,  from: "09:00", to: "23:00" },
      saturday:  { open: true,  from: "10:00", to: "23:00" },
      sunday:    { open: true,  from: "11:00", to: "20:00" },
    },
  });
  console.log(`Created demo tenant: ${demoTenant.name} (slug: ${demoTenant.slug})`);

  // 3. Demo tenant owner
  const demoOwner = await User.create({
    name: "Mama Adaeze",
    email: "muhammedabiodun42@gmail.com",
    passwordHash,
    platformRoles: [],
    memberships: [
      {
        tenantId: demoTenant._id,
        roles: ["tenant_owner", "tenant_admin"],
        active: true,
      },
    ],
    twoFaEnabled: false,
  });
  console.log(`Created demo tenant owner: ${demoOwner.email}`);

  // 4. Six menu items
  const menuItems = await MenuItem.insertMany([
    {
      tenantId: demoTenant._id,
      name: "Jollof Rice + Chicken",
      category: "Rice Dishes",
      description: "Party-style smoky jollof rice served with a full grilled chicken leg and a side of coleslaw.",
      basePrice: 4500,
      available: true,
      photos: [{ url: "https://images.unsplash.com/photo-1701579231349-d7459f8ec40d?w=600&auto=format&fit=crop&q=80", alt: "Jollof Rice with Chicken" }],
    },
    {
      tenantId: demoTenant._id,
      name: "Fried Rice + Turkey",
      category: "Rice Dishes",
      description: "Colourful Nigerian fried rice loaded with mixed vegetables, prawns and a generous turkey leg.",
      basePrice: 6000,
      available: true,
      photos: [{ url: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80", alt: "Fried Rice with Turkey" }],
    },
    {
      tenantId: demoTenant._id,
      name: "Egusi Soup + Eba",
      category: "Soups",
      description: "Rich, thick egusi soup slow-cooked with assorted meats, stockfish and palm oil — served with a large soft eba.",
      basePrice: 5500,
      available: true,
      photos: [{ url: "https://images.unsplash.com/photo-1574484284002-952d92456975?w=600&auto=format&fit=crop&q=80", alt: "Egusi Soup with Eba" }],
    },
    {
      tenantId: demoTenant._id,
      name: "Beef Suya (200g)",
      category: "Grills",
      description: "Thinly sliced beef skewers marinated in house spice blend, flame-grilled and served with fresh onions and tomatoes.",
      basePrice: 3500,
      available: true,
      photos: [{ url: "https://images.unsplash.com/photo-1544025162-d76538253f6f?w=600&auto=format&fit=crop&q=80", alt: "Beef Suya" }],
    },
    {
      tenantId: demoTenant._id,
      name: "Chicken Shawarma",
      category: "Wraps",
      description: "Grilled seasoned chicken strips wrapped in soft flatbread with garlic sauce, fresh cabbage and tomatoes.",
      basePrice: 3800,
      available: true,
      photos: [{ url: "https://images.unsplash.com/photo-1561651823-34feb02250e4?w=600&auto=format&fit=crop&q=80", alt: "Chicken Shawarma" }],
    },
    {
      tenantId: demoTenant._id,
      name: "Pepper Soup (Catfish)",
      category: "Soups",
      description: "Spicy catfish pepper soup with uziza leaves and aromatic spices — a true Nigerian classic.",
      basePrice: 5000,
      available: true,
      photos: [{ url: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&auto=format&fit=crop&q=80", alt: "Pepper Soup" }],
    },
    {
      tenantId: demoTenant._id,
      name: "Puff Puff (6 pieces)",
      category: "Snacks",
      description: "Golden, fluffy fried dough balls lightly sweetened — perfect as a starter or side snack.",
      basePrice: 1200,
      available: true,
      photos: [{ url: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&auto=format&fit=crop&q=80", alt: "Puff Puff" }],
    },
    {
      tenantId: demoTenant._id,
      name: "Chilled Zobo Drink",
      category: "Drinks",
      description: "House-made hibiscus drink brewed with ginger and pineapple, perfectly sweetened and chilled.",
      basePrice: 800,
      available: true,
      photos: [{ url: "https://images.unsplash.com/photo-1543253687-c931c8e01820?w=600&auto=format&fit=crop&q=80", alt: "Zobo Drink" }],
    },
    {
      tenantId: demoTenant._id,
      name: "Chapman Cocktail",
      category: "Drinks",
      description: "Nigeria's favourite party drink — a refreshing mix of Fanta, Sprite, Grenadine and cucumber.",
      basePrice: 1500,
      available: true,
      photos: [{ url: "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&auto=format&fit=crop&q=80", alt: "Chapman Cocktail" }],
    },
  ]);
  console.log(`Created ${menuItems.length} menu items for Mama's Kitchen.`);

  // 5. Three sample paid orders for today
  const today = new Date();
  const paidAt = new Date(today.getTime() - 2 * 60 * 60 * 1000);

  await Order.insertMany([
    {
      tenantId: demoTenant._id,
      orderNumber: "ORD-0001",
      source: "web",
      status: "PAID",
      customer: { name: "Tunde Bakare", phone: "+2348012345678", address: "5 Broad Street, Lagos Island" },
      fulfilmentType: "delivery",
      items: [
        { name: "Jollof Rice + Chicken", quantity: 2, unitPrice: 4500, lineTotal: 9000 },
        { name: "Chilled Zobo Drink", quantity: 2, unitPrice: 800, lineTotal: 1600 },
      ],
      pricing: { itemSubtotal: 10600, deliveryFee: 1200, serviceFee: 530, totalPayable: 12330 },
      payment: { provider: "paystack", reference: "PAY-001", paidAt },
      createdAt: paidAt,
    },
    {
      tenantId: demoTenant._id,
      orderNumber: "ORD-0002",
      source: "voice",
      status: "READY",
      customer: { name: "Amaka Okonkwo", phone: "+2348087654321" },
      fulfilmentType: "pickup",
      items: [
        { name: "Egusi Soup + Eba", quantity: 1, unitPrice: 5500, lineTotal: 5500 },
      ],
      pricing: { itemSubtotal: 5500, deliveryFee: 0, serviceFee: 275, totalPayable: 5775 },
      payment: { provider: "paystack", reference: "PAY-002", paidAt: new Date(today.getTime() - 1 * 60 * 60 * 1000) },
      createdAt: new Date(today.getTime() - 1 * 60 * 60 * 1000),
    },
    {
      tenantId: demoTenant._id,
      orderNumber: "ORD-0003",
      source: "whatsapp",
      status: "PENDING_PAYMENT",
      customer: { name: "Emeka Nwosu", phone: "+2348098765432", address: "22 Marina Road, Lagos" },
      fulfilmentType: "delivery",
      items: [
        { name: "Beef Suya (200g)", quantity: 3, unitPrice: 3500, lineTotal: 10500 },
        { name: "Chicken Shawarma", quantity: 1, unitPrice: 3800, lineTotal: 3800 },
      ],
      pricing: { itemSubtotal: 14300, deliveryFee: 1500, serviceFee: 715, totalPayable: 16515 },
      payment: { provider: "paystack", reference: "PAY-003", expiresAt: new Date(today.getTime() + 15 * 60 * 1000) },
      createdAt: new Date(today.getTime() - 15 * 60 * 1000),
    },
  ]);
  console.log("Created 3 sample orders for Mama's Kitchen.");

  console.log("\n=== Seed complete ===");
  console.log("Super admin:    louisdiaz43@gmail.com       / 123456");
  console.log("Tenant owner:   muhammedabiodun42@gmail.com / 123456");
  console.log("Demo tenant:    mamaskitchen (active, live)");
  console.log("Menu items: 9, Orders: 3");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(async (error) => {
  console.error("Seed failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
