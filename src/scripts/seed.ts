import "dotenv/config";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { hashPassword } from "../shared/security/password.js";
import { Tenant } from "../v1/tenants/tenant.model.js";
import { User } from "../v1/users/user.model.js";
import { MenuItem } from "../v1/menu/menu-item.model.js";

async function seed() {
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });
  console.log("Connected to MongoDB.");

  // Drop all collections (clear all documents)
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  console.log("Cleared all collections.");

  const passwordHash = await hashPassword("123456");

  // Demo tenant — active subscription so landing page shows coming-soon
  const demoTenant = await Tenant.create({
    name: "ChowCall Kitchen Demo",
    slug: "demo",
    logo: "",
    deliveryPricing: {
      mode: "distance",
      baseFee: 700,
      perKmRate: 250,
      minimumDeliveryFee: 1000,
      maximumDeliveryFee: 5000,
      maxDeliveryRadiusKm: 15,
    },
    serviceFee: {
      enabled: true,
      mode: "percentage",
      percentage: 5,
    },
    billingPlan: "starter",
    subscriptionStatus: "active",
  });
  console.log(`Created demo tenant: ${demoTenant.name} (slug: ${demoTenant.slug})`);

  // Second tenant — unpaid, goes through plan selection
  const tenant = await Tenant.create({
    name: "Chow Tenant",
    slug: "tenant",
    billingPlan: "starter",
    subscriptionStatus: "unpaid",
  });
  console.log(`Created tenant: ${tenant.name} (slug: ${tenant.slug})`);

  // Super admin
  const superAdmin = await User.create({
    name: "ChowCall Super Admin",
    email: "admin@gmail.com",
    passwordHash,
    platformRoles: ["platform_owner"],
    memberships: [],
    twoFaEnabled: true,
  });
  console.log(`Created super admin: ${superAdmin.email}`);

  // Tenant admin
  const tenantAdmin = await User.create({
    name: "Chow Tenant Admin",
    email: "muhammedabiodun42@gmail.com",
    passwordHash,
    platformRoles: [],
    memberships: [
      {
        tenantId: tenant._id,
        roles: ["tenant_owner", "tenant_admin"],
        active: true,
      },
    ],
    twoFaEnabled: true,
  });
  console.log(`Created tenant admin: ${tenantAdmin.email}`);

  // Demo tenant admin
  const demoAdmin = await User.create({
    name: "Demo Tenant Admin",
    email: "demo@gmail.com",
    passwordHash,
    platformRoles: [],
    memberships: [
      {
        tenantId: demoTenant._id,
        roles: ["tenant_owner", "tenant_admin"],
        active: true,
      },
    ],
    twoFaEnabled: true,
  });
  console.log(`Created demo admin: ${demoAdmin.email}`);

  // Sample menu items for demo tenant
  const menuItems = await MenuItem.insertMany([
    {
      tenantId: demoTenant._id,
      name: "Jollof Rice + Chicken",
      category: "Rice Dishes",
      basePrice: 4500,
      available: true,
    },
    {
      tenantId: demoTenant._id,
      name: "Fried Rice + Turkey",
      category: "Rice Dishes",
      basePrice: 6000,
      available: true,
    },
    {
      tenantId: demoTenant._id,
      name: "Chicken Shawarma",
      category: "Shawarma",
      basePrice: 3500,
      available: true,
    },
    {
      tenantId: demoTenant._id,
      name: "Bottle Water",
      category: "Drinks",
      basePrice: 500,
      available: true,
    },
  ]);
  console.log(`Created ${menuItems.length} menu items for demo tenant.`);

  console.log("\n=== Seed complete ===");
  console.log("Tenants: demo (active), tenant (unpaid)");
  console.log("Users: admin@gmail.com, muhammedabiodun42@gmail.com, demo@gmail.com (all password: 123456)");
  console.log("Menu items:", menuItems.length, "(demo tenant)");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(async (error) => {
  console.error("Seed failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
