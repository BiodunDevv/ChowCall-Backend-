import type { ServiceFeeConfig } from "./pricing.types.js";

export function calculateServiceFee(input: {
  itemSubtotal: number;
  itemCount: number;
  config: ServiceFeeConfig;
}) {
  const { config, itemSubtotal, itemCount } = input;
  if (!config.enabled) return 0;

  const percentageFee = config.percentage ? itemSubtotal * (config.percentage / 100) : 0;
  const flatFee = config.flatFee ?? 0;
  const packagingFee =
    config.packagingFee?.enabled && config.packagingFee.feePerItem
      ? config.packagingFee.feePerItem * itemCount
      : 0;
  const smallOrderFee =
    config.smallOrderFee?.enabled && itemSubtotal < config.smallOrderFee.threshold
      ? config.smallOrderFee.fee
      : 0;

  let fee = percentageFee + flatFee + packagingFee + smallOrderFee;
  if (config.minimumFee !== undefined) fee = Math.max(fee, config.minimumFee);
  if (config.maximumFee !== undefined) fee = Math.min(fee, config.maximumFee);
  return Math.round(fee);
}
