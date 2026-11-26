export const remap = (value: number, beforeLow: number, beForeHigh: number, afterLow: number, afterHigh: number) => {
  if (beforeLow === beForeHigh) return (afterLow + afterHigh) / 2
  return afterLow + ((value - beforeLow) * (afterHigh - afterLow)) / (beForeHigh - beforeLow)
}
