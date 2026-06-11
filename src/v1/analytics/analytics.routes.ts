import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { Order } from "../orders/order.model.js";
import { Payment } from "../payments/payment.model.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requireTenant);

analyticsRouter.get("/summary", async (req, res) => {
  const tenantId = req.user!.tenantId;
  const [orders, paidPayments] = await Promise.all([
    Order.aggregate([
      { $match: { tenantId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalPayable: { $sum: "$pricing.totalPayable" },
          deliveryFees: { $sum: "$pricing.deliveryFee" },
          serviceFees: { $sum: "$pricing.serviceFee" },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { tenantId, status: "paid" } },
      { $group: { _id: "$currency", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);

  res.json({ data: { orders, paidPayments } });
});

analyticsRouter.get("/", (_req, res) => {
  res.json({
    module: "analytics",
    status: "ready",
    endpoints: ["/v1/analytics/summary"],
  });
});
