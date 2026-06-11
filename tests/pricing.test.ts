import { describe, expect, it } from "vitest";
import { calculateDeliveryFee } from "../src/v1/pricing/delivery-fee.engine.js";
import { calculateServiceFee } from "../src/v1/pricing/service-fee.engine.js";
import { calculateTotal } from "../src/v1/pricing/total.engine.js";

describe("pricing engines", () => {
  it("calculates distance-based delivery fee with minimums and rounding", () => {
    const result = calculateDeliveryFee({
      fulfilmentType: "delivery",
      distanceKm: 8,
      itemSubtotal: 8500,
      config: {
        baseFee: 700,
        perKmRate: 250,
        minimumDeliveryFee: 1000,
        maximumDeliveryFee: 5000,
        maxDeliveryRadiusKm: 15,
        roundingRule: "nearest_100",
      },
    });

    expect(result.deliveryFee).toBe(2700);
    expect(result.outOfZone).toBe(false);
  });

  it("calculates service fee with small order and max cap", () => {
    const result = calculateServiceFee({
      itemSubtotal: 4000,
      itemCount: 2,
      config: {
        enabled: true,
        percentage: 5,
        minimumFee: 200,
        maximumFee: 1500,
        smallOrderFee: { enabled: true, threshold: 5000, fee: 500 },
      },
    });

    expect(result).toBe(700);
  });

  it("calculates total payable", () => {
    expect(
      calculateTotal({
        itemSubtotal: 9500,
        deliveryFee: 2700,
        serviceFee: 475,
      }).totalPayable
    ).toBe(12675);
  });
});
