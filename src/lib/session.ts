import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "mobix_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  v: 2;
  userId: string;
  companyId: string;
  sessionVersion: number;
  exp: number;
};

function getSecret() {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") {
    return "mobix-development-only-secret-change-before-production-2026";
  }
  throw new Error("AUTH_SECRET no está configurado o es demasiado corto. Define al menos 32 caracteres antes de iniciar MOBIX en producción.");
}

function signBody(body: string) {
  return createHmac("sha256", getSecret()).update(body).digest("base64url");
}

function encode(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signBody(body)}`;
}

function decode(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(signBody(body));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (
      payload.v !== 2 ||
      !payload.userId ||
      !payload.companyId ||
      !Number.isInteger(payload.sessionVersion) ||
      payload.sessionVersion < 1 ||
      !Number.isFinite(payload.exp)
    ) return null;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, companyId: string, sessionVersion: number) {
  const payload: SessionPayload = {
    v: 2,
    userId,
    companyId,
    sessionVersion,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const store = await cookies();
  store.set(SESSION_COOKIE, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function readSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? decode(token) : null;
}

export async function clearSession() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
