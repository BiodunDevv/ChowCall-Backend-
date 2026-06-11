import { AppError } from "../../shared/errors/app-error.js";
import { calculateDeliveryFee } from "../pricing/delivery-fee.engine.js";
import { calculateServiceFee } from "../pricing/service-fee.engine.js";
import { calculateTotal } from "../pricing/total.engine.js";
import type { DeliveryPricingConfig, ServiceFeeConfig } from "../pricing/pricing.types.js";

export type PriceableOrderItem = {
  name?: string;
  quantity?: number;
  unitPrice?: number;
  variants?: Array<{ name?: string; option?: string; price?: number }>;
  addons?: Array<{ name?: string; price?: number; quantity?: number }>;
  notes?: string;
};

export function priceOrder(input: {
  fulfilmentType: "pickup" | "delivery";
  distanceKm?: number;
  durationMinutes?: number;
  discount?: number;
  items: PriceableOrderItem[];
  deliveryPricing: DeliveryPricingConfig;
  serviceFee: ServiceFeeConfig;
}) {
  if (!input.items.length) {
    throw new AppError(400, "At least one order item is required.", "ORDER_ITEMS_REQUIRED");
  }

  const pricedItems = input.items.map((item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unitPrice ?? 0);
    const variantsTotal = (item.variants ?? []).reduce((sum, variant) => sum + Number(variant.price ?? 0), 0);
    const addonsTotal = (item.addons ?? []).reduce(
      (sum, addon) => sum + Number(addon.price ?? 0) * Number(addon.quantity ?? 1),
      0
    );
    const lineTotal = quantity * (unitPrice + variantsTotal + addonsTotal);

    return {
      ...item,
      quantity,
      unitPrice,
      lineTotal,
    };
  });

  const itemSubtotal = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const itemCount = pricedItems.reduce((sum, item) => sum + item.quantity, 0);
  const delivery = calculateDeliveryFee({
    fulfilmentType: input.fulfilmentType,
    distanceKm: input.distanceKm,
    itemSubtotal,
    config: input.deliveryPricing,
  });
  const serviceFee = calculateServiceFee({
    itemSubtotal,
    itemCount,
    config: input.serviceFee,
  });

  return {
    items: pricedItems,
    pricing: {
      ...calculateTotal({
        itemSubtotal,
        deliveryFee: delivery.deliveryFee,
        serviceFee,
        discount: Number(input.discount ?? 0),
      }),
      distanceKm: input.distanceKm,
      durationMinutes: input.durationMinutes,
    },
    outOfZone: delivery.outOfZone,
  };
}
