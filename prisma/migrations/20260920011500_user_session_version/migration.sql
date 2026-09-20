ALTER TABLE "users"
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "users"
  ADD CONSTRAINT "users_sessionVersion_positive" CHECK ("sessionVersion" >= 1);
