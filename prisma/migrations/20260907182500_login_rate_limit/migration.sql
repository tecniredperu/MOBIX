-- MOBIX · limitación distribuida de intentos de inicio de sesión
CREATE TABLE "auth_login_limits" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_login_limits_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "auth_login_limits_attempts_nonnegative" CHECK ("attempts" >= 0)
);

CREATE INDEX "auth_login_limits_locked_idx" ON "auth_login_limits"("lockedUntil");
CREATE INDEX "auth_login_limits_updated_idx" ON "auth_login_limits"("updatedAt");
