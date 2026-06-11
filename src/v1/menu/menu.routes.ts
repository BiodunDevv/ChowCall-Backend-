import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { tenantQuery } from "../../shared/utils/tenant-query.js";
import { MenuItem } from "./menu-item.model.js";

export const menuRouter = Router();

menuRouter.use(requireAuth, requireTenant);

menuRouter.get("/", async (req, res) => {
  res.json({ data: await MenuItem.find(tenantQuery(req.user!.tenantId!)).sort({ category: 1, name: 1 }) });
});

menuRouter.post(
  "/",
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res) => {
    const item = await MenuItem.create({
      ...req.body,
      tenantId: req.user!.tenantId,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: item });
  }
);

menuRouter.patch(
  "/:id",
  requireRoles("tenant_owner", "tenant_admin", "manager", "kitchen_staff"),
  async (req, res) => {
    const item = await MenuItem.findOneAndUpdate(
      tenantQuery(req.user!.tenantId!, { _id: req.params.id }),
      req.body,
      { new: true, runValidators: true }
    );
    res.json({ data: item });
  }
);

menuRouter.delete(
  "/:id",
  requireRoles("tenant_owner", "tenant_admin"),
  async (req, res) => {
    await MenuItem.deleteOne(tenantQuery(req.user!.tenantId!, { _id: req.params.id }));
    res.status(204).send();
  }
);
