import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { roles } from "../../shared/constants/roles.js";
import { AppError } from "../../shared/errors/app-error.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { User } from "../users/user.model.js";

const inviteStaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  roles: z.array(z.enum(roles)).min(1).default(["viewer"]),
});

const updateRolesSchema = z.object({
  roles: z.array(z.enum(roles)).min(1),
});

export const staffRouter = Router();

staffRouter.use(requireAuth, requireTenant);

staffRouter.get("/", async (req, res) => {
  const staff = await User.find({
    memberships: { $elemMatch: { tenantId: req.user!.tenantId, active: true } },
  })
    .select("-passwordHash -refreshTokenHash")
    .sort({ name: 1 });

  res.json({ data: staff });
});

staffRouter.post(
  "/invite",
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res) => {
    const payload = inviteStaffSchema.parse(req.body);
    const email = payload.email.toLowerCase();
    const temporaryPassword = randomBytes(18).toString("base64url");
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const existing = await User.findOne({ email });
    if (existing) {
      const membership = existing.memberships.find(
        (item) => item.tenantId?.toString() === req.user!.tenantId
      );

      if (membership?.active) {
        throw new AppError(409, "This user is already active in the tenant.", "STAFF_ALREADY_EXISTS");
      }

      if (membership) {
        membership.roles = payload.roles;
        membership.active = true;
      } else {
        existing.memberships.push({
          tenantId: req.user!.tenantId,
          roles: payload.roles,
          active: true,
        });
      }

      existing.disabledAt = undefined;
      await existing.save();
      res.status(200).json({ data: sanitizeUser(existing), temporaryPassword: null });
      return;
    }

    const user = await User.create({
      name: payload.name,
      email,
      phone: payload.phone,
      passwordHash,
      platformRoles: [],
      memberships: [{ tenantId: req.user!.tenantId, roles: payload.roles, active: true }],
    });

    res.status(201).json({
      data: sanitizeUser(user),
      temporaryPassword,
      message: "Send this temporary password through a secure channel or email invite template.",
    });
  }
);

staffRouter.patch(
  "/:userId/roles",
  requireRoles("tenant_owner", "tenant_admin", "manager"),
  async (req, res) => {
    const payload = updateRolesSchema.parse(req.body);
    const user = await User.findOne({
      _id: req.params.userId,
      memberships: { $elemMatch: { tenantId: req.user!.tenantId, active: true } },
    });

    if (!user) {
      throw new AppError(404, "Staff member not found.", "STAFF_NOT_FOUND");
    }

    const membership = user.memberships.find((item) => item.tenantId?.toString() === req.user!.tenantId);
    if (membership) {
      membership.roles = payload.roles;
    }
    await user.save();

    res.json({ data: sanitizeUser(user) });
  }
);

staffRouter.patch(
  "/:userId/disable",
  requireRoles("tenant_owner", "tenant_admin"),
  async (req, res) => {
    const user = await User.findOne({
      _id: req.params.userId,
      memberships: { $elemMatch: { tenantId: req.user!.tenantId, active: true } },
    });

    if (!user) {
      throw new AppError(404, "Staff member not found.", "STAFF_NOT_FOUND");
    }

    const membership = user.memberships.find((item) => item.tenantId?.toString() === req.user!.tenantId);
    if (membership) {
      membership.active = false;
    }
    user.disabledAt = new Date();
    await user.save();

    res.json({ data: sanitizeUser(user) });
  }
);

function sanitizeUser(user: unknown) {
  const object = typeof (user as { toObject?: () => unknown }).toObject === "function"
    ? (user as { toObject: () => Record<string, unknown> }).toObject()
    : (user as Record<string, unknown>);
  delete object.passwordHash;
  delete object.refreshTokenHash;
  return object;
}
