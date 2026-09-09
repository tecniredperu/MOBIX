"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, clearSession, readSession } from "@/lib/session";
import { developmentBootstrapPassword, hashPassword, verifyPassword } from "@/lib/password";

export type AuthState = { error?: string; success?: string };

const LOGIN_ERROR = "Correo o contraseña incorrectos.";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}
function bootstrapPassword() {
  return process.env.MOBIX_BOOTSTRAP_PASSWORD?.trim() || developmentBootstrapPassword();
}
function safeRateKey(prefix: string, value: string) {
  return `${prefix}:${value.trim().toLowerCase().slice(0, 180)}`;
}
async function clientIp() {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = requestHeaders.get("x-real-ip")?.trim();
  return (forwarded || real || "unknown").slice(0, 120);
}
async function loginKeyLocked(key: string) {
  const row = await prisma.authLoginLimit.findUnique({
    where: { key },
    select: { lockedUntil: true },
  });
  return Boolean(row?.lockedUntil && row.lockedUntil.getTime() > Date.now());
}
async function recordFailedLogin(keys: string[]) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return;

  const now = new Date();
  const resetBefore = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const lockUntil = new Date(now.getTime() + LOGIN_LOCK_MS);
  const retentionBefore = new Date(now.getTime() - LOGIN_RETENTION_MS);

  await prisma.$transaction(async (tx) => {
    for (const key of unique) {
      const reset = await tx.authLoginLimit.updateMany({
        where: { key, windowStartedAt: { lt: resetBefore } },
        data: {
          attempts: 1,
          windowStartedAt: now,
          lockedUntil: null,
          updatedAt: now,
        },
      });

      if (reset.count > 0) continue;

      const row = await tx.authLoginLimit.upsert({
        where: { key },
        create: {
          key,
          attempts: 1,
          windowStartedAt: now,
          lockedUntil: null,
          updatedAt: now,
        },
        update: {
          attempts: { increment: 1 },
          updatedAt: now,
        },
        select: { attempts: true, lockedUntil: true },
      });

      if (row.attempts >= LOGIN_MAX_ATTEMPTS && (!row.lockedUntil || row.lockedUntil.getTime() <= now.getTime())) {
        await tx.authLoginLimit.update({
          where: { key },
          data: { lockedUntil: lockUntil, updatedAt: now },
        });
      }
    }

    await tx.authLoginLimit.deleteMany({
      where: { updatedAt: { lt: retentionBefore } },
    });
  });
}
async function clearLoginLimits(keys: string[]) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return;
  await prisma.authLoginLimit.deleteMany({ where: { key: { in: unique } } });
}

export async function loginAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const email = text(formData.get("email")).toLowerCase();
  const password = text(formData.get("password"));
  const nextPath = safeNext(text(formData.get("next")) || "/");
  const ip = await clientIp();
  const emailKey = safeRateKey("email", email || "invalid");
  const ipKey = safeRateKey("ip", ip);
  const rateKeys = [emailKey, ipKey];

  if (await loginKeyLocked(emailKey) || await loginKeyLocked(ipKey)) {
    return { error: "Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar." };
  }

  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
    await recordFailedLogin(rateKeys);
    return { error: LOGIN_ERROR };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: {
          status: "ACTIVE",
          company: { status: "ACTIVE" },
          role: { status: "ACTIVE" },
        },
        include: { company: true, role: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user || user.status !== "ACTIVE" || !user.memberships.length) {
    await recordFailedLogin(rateKeys);
    return { error: LOGIN_ERROR };
  }

  const legacy = user.passwordHash === "LOGIN_NOT_ENABLED_YET";
  const bootstrap = bootstrapPassword();
  const valid = legacy ? Boolean(bootstrap && password === bootstrap) : verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailedLogin(rateKeys);
    if (legacy && process.env.NODE_ENV === "production" && !bootstrap) {
      return { error: "El acceso inicial no está configurado. Define MOBIX_BOOTSTRAP_PASSWORD en el hosting." };
    }
    return { error: LOGIN_ERROR };
  }

  await clearLoginLimits(rateKeys);

  if (legacy) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } });
  }

  const membership = user.memberships[0];
  await createSession(user.id, membership.companyId);
  await prisma.auditLog.create({
    data: {
      companyId: membership.companyId,
      userId: user.id,
      action: "LOGIN",
      entity: "AUTH_SESSION",
      entityId: user.id,
      ipAddress: ip === "unknown" ? null : ip,
      newValues: { email: user.email, roleId: membership.roleId },
    },
  }).catch(() => undefined);

  redirect(nextPath);
}

export async function logoutAction() {
  const session = await readSession();
  if (session) {
    await prisma.auditLog.create({
      data: {
        companyId: session.companyId,
        userId: session.userId,
        action: "LOGOUT",
        entity: "AUTH_SESSION",
        entityId: session.userId,
      },
    }).catch(() => undefined);
  }
  await clearSession();
  redirect("/login");
}

export async function changePasswordAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const session = await readSession();
  if (!session) redirect("/login");

  const currentPassword = text(formData.get("currentPassword"));
  const newPassword = text(formData.get("newPassword"));
  const confirmPassword = text(formData.get("confirmPassword"));
  if (newPassword.length < 10) return { error: "La nueva contraseña debe tener al menos 10 caracteres." };
  if (!/[A-ZÁÉÍÓÚÑ]/.test(newPassword) || !/[a-záéíóúñ]/.test(newPassword) || !/[0-9]/.test(newPassword)) return { error: "La nueva contraseña debe incluir mayúsculas, minúsculas y números." };
  if (newPassword !== confirmPassword) return { error: "La confirmación de contraseña no coincide." };
  if (currentPassword === newPassword) return { error: "La nueva contraseña debe ser diferente a la actual." };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ACTIVE") redirect("/login");
  const legacy = user.passwordHash === "LOGIN_NOT_ENABLED_YET";
  const validCurrent = legacy ? currentPassword === bootstrapPassword() : verifyPassword(currentPassword, user.passwordHash);
  if (!validCurrent) return { error: "La contraseña actual no es correcta." };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } });
    await tx.auditLog.create({
      data: {
        companyId: session.companyId,
        userId: session.userId,
        action: "UPDATE",
        entity: "USER_PASSWORD",
        entityId: user.id,
        newValues: { changed: true },
      },
    });
  });
  await createSession(session.userId, session.companyId);
  return { success: "Contraseña actualizada correctamente." };
}
