import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, encoded: string) {
  const [scheme, salt, hashHex] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !hashHex || !/^[a-f0-9]+$/i.test(hashHex)) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    if (!expected.length) return false;
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function developmentBootstrapPassword() {
  return process.env.NODE_ENV === "production" ? "" : "MobixLocal2026!";
}
