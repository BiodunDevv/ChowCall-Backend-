import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { tenantQuery } from "../../shared/utils/tenant-query.js";
import { MenuItem } from "../menu/menu-item.model.js";
import { InventoryLog } from "./inventory-log.model.js";

const availabilitySchema = z.object({
  available: z.boolean(),
  reason: z.string().max(240).optional(),
  resetAt: z.coerce.date().optional(),
});

const commandSchema = z.object({
  from: z.string().min(7),
  text: z.string().min(2).max(280),
});

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth, requireTenant);

inventoryRouter.get("/", async (req, res) => {
  const items = await MenuItem.find(tenantQuery(req.user!.tenantId!, {}))
    .select("name category available updatedAt")
    .sort({ category: 1, name: 1 });

  res.json({ data: items });
});

inventoryRouter.patch(
  "/items/:id/availability",
  requireRoles("tenant_owner", "tenant_admin", "manager", "kitchen_staff"),
  async (req, res) => {
    const payload = availabilitySchema.parse(req.body);
    const item = await MenuItem.findOneAndUpdate(
      tenantQuery(req.user!.tenantId!, { _id: req.params.id }),
      { $set: { available: payload.available } },
      { new: true, runValidators: true }
    );

    await InventoryLog.create({
      tenantId: req.user!.tenantId,
      menuItemId: req.params.id,
      action: payload.available ? "marked_available" : "marked_sold_out",
      reason: payload.reason,
      resetAt: payload.resetAt,
      createdBy: req.user!.id,
    });

    res.json({ data: item });
  }
);

inventoryRouter.post("/commands/whatsapp", async (req, res) => {
  const payload = commandSchema.parse(req.body);
  const parsed = parseInventoryCommand(payload.text);

  res.json({
    data: {
      from: payload.from,
      parsed,
      message:
        "Command parsed. Wire this endpoint to the active WhatsApp provider when WhatsApp messaging is enabled.",
    },
  });
});

function parseInventoryCommand(text: string) {
  const normalized = text.trim().toLowerCase();
  const soldOutMatch = normalized.match(/^(sold out|soldout|86)\s+(.+)$/);
  const availableMatch = normalized.match(/^(available|back|restock)\s+(.+)$/);

  if (soldOutMatch) {
    return { action: "mark_sold_out", itemName: soldOutMatch[2] };
  }

  if (availableMatch) {
    return { action: "mark_available", itemName: availableMatch[2] };
  }

  return {
    action: "unknown",
    itemName: null,
    examples: ["sold out jollof rice", "available chicken wings"],
  };
}
