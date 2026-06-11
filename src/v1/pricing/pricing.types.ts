import type { RoundingRule } from "../../shared/utils/rounding.js";

export type DeliveryPricingConfig = {
  baseFee: number;
  perKmRate: number;
  minimumDeliveryFee: number;
  maximumDeliveryFee?: number;
  maxDeliveryRadiusKm?: number;
  roundingRule: RoundingRule;
  freeDelivery?: {
    enabled: boolean;
    minimumOrderSubtotal?: number;
    maxDistanceKm?: number;
  };
  surgeMultiplier?: number;
  zoneOverrideFee?: number;
};

export type ServiceFeeConfig = {
  enabled: boolean;
  percentage?: number;
  flatFee?: number;
  minimumFee?: number;
  maximumFee?: number;
  smallOrderFee?: {
    enabled: boolean;
    threshold: number;
    fee: number;
  };
  packagingFee?: {
    enabled: boolean;
    feePerItem?: number;
  };
};
