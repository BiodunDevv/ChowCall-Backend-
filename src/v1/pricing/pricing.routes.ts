import { Router } from "express";
import { calculateDeliveryFee } from "./delivery-fee.engine.js";
import { calculateServiceFee } from "./service-fee.engine.js";
import { calculateTotal } from "./total.engine.js";

export const pricingRouter = Router();

pricingRouter.post("/quote", (req, res, next) => {
  try {
    const itemSubtotal = Number(req.body.itemSubtotal ?? 0);
    const itemCount = Number(req.body.itemCount ?? 0);
    const fulfilmentType = req.body.fulfilmentType ?? "delivery";
    const delivery = calculateDeliveryFee({
      fulfilmentType,
      distanceKm: req.body.distanceKm,
      itemSubtotal,
      config: req.body.deliveryPricing,
    });
    const serviceFee = calculateServiceFee({
      itemSubtotal,
      itemCount,
      config: req.body.serviceFee,
    });
    res.json({
      data: {
        ...calculateTotal({
          itemSubtotal,
          deliveryFee: delivery.deliveryFee,
          serviceFee,
          discount: req.body.discount ?? 0,
        }),
        outOfZone: delivery.outOfZone,
      },
    });
  } catch (error) {
    next(error);
  }
});
