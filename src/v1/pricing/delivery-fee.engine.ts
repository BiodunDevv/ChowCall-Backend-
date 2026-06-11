import { AppError } from "../../shared/errors/app-error.js";
import { applyRounding } from "../../shared/utils/rounding.js";
import type { DeliveryPricingConfig } from "./pricing.types.js";

export function calculateDeliveryFee(input: {
  fulfilmentType: "pickup" | "delivery";
  distanceKm?: number;
  itemSubtotal: number;
  config: DeliveryPricingConfig;
}) {
  if (input.fulfilmentType === "pickup") {
    return { deliveryFee: 0, outOfZone: false };
  }

  if (input.distanceKm === undefined) {
    throw new AppError(400, "Delivery distance is required", "DISTANCE_REQUIRED");
  }

  const { config, distanceKm, itemSubtotal } = input;
  const outOfZone =
    config.maxDeliveryRadiusKm !== undefined && distanceKm > config.maxDeliveryRadiusKm;

  if (config.zoneOverrideFee !== undefined) {
    return { deliveryFee: config.zoneOverrideFee, outOfZone };
  }

  const freeDeliveryApplies =
    config.freeDelivery?.enabled &&
    (!config.freeDelivery.minimumOrderSubtotal ||
      itemSubtotal >= config.freeDelivery.minimumOrderSubtotal) &&
    (!config.freeDelivery.maxDistanceKm || distanceKm <= config.freeDelivery.maxDistanceKm);

  if (freeDeliveryApplies) {
    return { deliveryFee: 0, outOfZone };
  }

  let fee = config.baseFee + distanceKm * config.perKmRate;
  fee = Math.max(fee, config.minimumDeliveryFee);
  if (config.maximumDeliveryFee !== undefined) fee = Math.min(fee, config.maximumDeliveryFee);
  if (config.surgeMultiplier) fee *= config.surgeMultiplier;

  return { deliveryFee: applyRounding(fee, config.roundingRule), outOfZone };
}
