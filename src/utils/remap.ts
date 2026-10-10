export const remap = (value: number, beforeLow: number, beForeHigh: number, afterLow: number, afterHigh: number) => {
  if (beForeHigh === beforeLow) return (afterLow + afterHigh) / 2
  return afterLow + ((value - beforeLow) * (afterHigh - afterLow)) / (beForeHigh - beforeLow)
}
