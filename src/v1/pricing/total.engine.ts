export function calculateTotal(input: {
  itemSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discount?: number;
}) {
  const discount = input.discount ?? 0;
  return {
    ...input,
    discount,
    totalPayable: Math.max(
      0,
      input.itemSubtotal + input.deliveryFee + input.serviceFee - discount
    ),
  };
}
