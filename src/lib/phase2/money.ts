export function decimalToMinorUnits(value: string, scale = 2): bigint {
  if (!new RegExp(`^(0|[1-9]\\d*)(\\.\\d{1,${scale}})?$`).test(value)) throw new Error("Invalid non-negative decimal");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * bigintPowerOfTen(scale) + BigInt(fraction.padEnd(scale, "0"));
}

function bigintPowerOfTen(scale: number): bigint {
  let value = BigInt(1);
  for (let index = 0; index < scale; index += 1) value *= BigInt(10);
  return value;
}

export function minorUnitsToDecimal(value: bigint, scale = 2): string {
  if (value < BigInt(0)) throw new Error("Negative values are not supported");
  const divisor = bigintPowerOfTen(scale);
  return `${value / divisor}.${(value % divisor).toString().padStart(scale, "0")}`;
}

export function multiplyDecimal(quantity: string, unitCost: string): string {
  const quantityMills = decimalToMinorUnits(quantity, 3);
  const costCents = decimalToMinorUnits(unitCost, 2);
  const product = quantityMills * costCents;
  if (product % BigInt(1000) !== BigInt(0)) throw new Error("Calculated amount has sub-cent precision");
  return minorUnitsToDecimal(product / BigInt(1000), 2);
}

export function sumMoney(values: readonly string[]): string {
  return minorUnitsToDecimal(values.reduce((sum, value) => sum + decimalToMinorUnits(value), BigInt(0)));
}
