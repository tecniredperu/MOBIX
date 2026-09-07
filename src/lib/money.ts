export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isValidMoney(value: number, options: { allowZero?: boolean; max?: number } = {}) {
  const { allowZero = true, max = 999_999_999 } = options;
  if (!Number.isFinite(value) || value < 0 || value > max) return false;
  return allowZero ? true : value > 0;
}
