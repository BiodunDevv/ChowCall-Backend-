import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireTenant } from "../../shared/middleware/tenant-scope.js";
import { Order } from "../orders/order.model.js";
import { Payment } from "../payments/payment.model.js";
import mongoose from "mongoose";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requireTenant);

type DashboardOrder = {
  _id: unknown;
  orderNumber?: string;
  status?: string;
  source?: string;
  fulfilmentType?: string;
  customer?: { name?: string };
  pricing?: { totalPayable?: number; deliveryFee?: number; serviceFee?: number };
  payment?: { paidAt?: Date };
  createdAt?: Date;
};

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

analyticsRouter.get("/dashboard", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - todayStart.getDay()); // Sunday
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Build the last 7 day buckets (Sun..Sat style based on date)
    const dayLabels: string[] = [];
    const dayStarts: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(todayStart.getDate() - i);
      const label = d.toLocaleDateString("en-NG", { weekday: "short" });
      dayLabels.push(label);
      dayStarts.push(d);
    }

    const [allOrders, recentOrderDocs] = await Promise.all([
      Order.find({ tenantId }).lean(),
      Order.find({ tenantId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("orderNumber status source fulfilmentType customer pricing payment createdAt")
        .lean(),
    ]);

    // Compute aggregations in memory
    let todayOrders = 0, todayRevenue = 0, todayPending = 0;
    let weekOrders = 0, weekRevenue = 0;
    let monthOrders = 0, monthRevenue = 0;
    let totalOrders = 0, totalRevenue = 0;

    const statusCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};

    // Revenue chart buckets keyed by date string
    const chartMap: Record<string, { revenue: number; orders: number }> = {};
    for (const d of dayStarts) {
      const key = d.toISOString().slice(0, 10);
      chartMap[key] = { revenue: 0, orders: 0 };
    }

    for (const order of allOrders as DashboardOrder[]) {
      totalOrders++;
      const paid = order.payment?.paidAt != null;
      const payable = order.pricing?.totalPayable ?? 0;
      if (paid) totalRevenue += payable;

      const createdAt = new Date(order.createdAt as Date);

      if (createdAt >= todayStart) {
        todayOrders++;
        if (paid) todayRevenue += payable;
        if (order.status === "PENDING_PAYMENT") todayPending++;
      }
      if (createdAt >= weekStart) {
        weekOrders++;
        if (paid) weekRevenue += payable;
      }
      if (createdAt >= monthStart) {
        monthOrders++;
        if (paid) monthRevenue += payable;
      }

      const s = String(order.status ?? "unknown");
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;

      const src = String(order.source ?? "unknown");
      sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;

      const key = createdAt.toISOString().slice(0, 10);
      if (chartMap[key]) {
        chartMap[key].orders++;
        if (paid) chartMap[key].revenue += payable;
      }
    }

    const revenueChart = dayStarts.map((d, i) => {
      const key = d.toISOString().slice(0, 10);
      return {
        date: dayLabels[i],
        revenue: chartMap[key]?.revenue ?? 0,
        orders: chartMap[key]?.orders ?? 0,
      };
    });

    const recentOrders = (recentOrderDocs as DashboardOrder[]).map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber ?? "",
      status: o.status ?? "",
      source: o.source ?? "",
      fulfilmentType: o.fulfilmentType ?? "",
      customerName: o.customer?.name ?? "",
      totalPayable: o.pricing?.totalPayable ?? 0,
      createdAt: o.createdAt,
    }));

    res.json({
      data: {
        todayOrders,
        todayRevenue,
        todayPending,
        weekOrders,
        weekRevenue,
        monthOrders,
        monthRevenue,
        totalOrders,
        totalRevenue,
        recentOrders,
        statusCounts,
        sourceCounts,
        revenueChart,
      },
    });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/", (_req, res) => {
  res.json({
    module: "analytics",
    status: "ready",
    endpoints: ["/v1/analytics/summary", "/v1/analytics/dashboard"],
  });
});
