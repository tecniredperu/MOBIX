"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, clearSession, readSession } from "@/lib/session";
import { developmentBootstrapPassword, hashPassword, verifyPassword } from "@/lib/password";

export type AuthState = { error?: string; success?: string };

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function bootstrapPassword() {
  return process.env.MOBIX_BOOTSTRAP_PASSWORD?.trim() || developmentBootstrapPassword();
}

export async function loginAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const email = text(formData.get("email")).toLowerCase();
  const password = text(formData.get("password"));

  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
    return { error: "Correo o contraseña incorrectos." };
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
    return { error: "Correo o contraseña incorrectos." };
  }

  const legacy = user.passwordHash === "LOGIN_NOT_ENABLED_YET";
  const bootstrap = bootstrapPassword();
  const valid = legacy ? Boolean(bootstrap && password === bootstrap) : verifyPassword(password, user.passwordHash);
  if (!valid) {
    if (legacy && process.env.NODE_ENV === "production" && !bootstrap) {
      return { error: "El acceso inicial no está configurado. Define MOBIX_BOOTSTRAP_PASSWORD en el hosting." };
    }
    return { error: "Correo o contraseña incorrectos." };
  }

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
      newValues: { email: user.email, roleId: membership.roleId },
    },
  }).catch(() => undefined);

  redirect("/");
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
  if (newPassword !== confirmPassword) return { error: "La confirmación de contraseña no coincide." };
  if (currentPassword === newPassword) return { error: "La nueva contraseña debe ser diferente a la actual." };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ACTIVE") redirect("/login");
  const legacy = user.passwordHash === "LOGIN_NOT_ENABLED_YET";
  const validCurrent = legacy
    ? currentPassword === bootstrapPassword()
    : verifyPassword(currentPassword, user.passwordHash);
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
