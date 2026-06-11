import { Router } from "express";
import { Tenant } from "./tenant.model.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";

export const tenantRouter = Router();

// Public endpoint — no auth required
tenantRouter.get("/by-slug/:slug", async (req, res) => {
  const tenant = await Tenant.findOne({ slug: req.params.slug }).select("name slug logo subscriptionStatus");
  if (!tenant) {
    res.status(404).json({ error: { code: "TENANT_NOT_FOUND", message: "Tenant not found" } });
    return;
  }
  res.json({ data: tenant });
});

tenantRouter.use(requireAuth);

tenantRouter.get("/", requireRoles("platform_owner", "platform_admin"), async (_req, res) => {
  res.json({ data: await Tenant.find().sort({ createdAt: -1 }).limit(100) });
});

tenantRouter.get("/current", async (req, res) => {
  const tenant = req.user?.tenantId ? await Tenant.findById(req.user.tenantId) : null;
  res.json({ data: tenant });
});

tenantRouter.patch(
  "/current",
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res) => {
    const tenant = await Tenant.findByIdAndUpdate(req.user?.tenantId, req.body, {
      new: true,
      runValidators: true,
    });
    res.json({ data: tenant });
  }
);
