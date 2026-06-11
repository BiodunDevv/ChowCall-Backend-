import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireRoles } from "../../shared/middleware/rbac.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { User } from "./user.model.js";

export const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get("/me", async (req, res) => {
  const user = await User.findById(req.user!.id).select("-passwordHash -refreshTokenHash");
  res.json({ data: user });
});

userRouter.get("/", requireRoles("platform_owner", "platform_admin"), async (_req, res) => {
  const users = await User.find().select("-passwordHash -refreshTokenHash").sort({ createdAt: -1 }).limit(100);
  res.json({ data: users });
});

userRouter.get("/tenant", requireTenant, async (req, res) => {
  const users = await User.find({
    memberships: { $elemMatch: { tenantId: req.user!.tenantId, active: true } },
  })
    .select("-passwordHash -refreshTokenHash")
    .sort({ name: 1 });

  res.json({ data: users });
});
