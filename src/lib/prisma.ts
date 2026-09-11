import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está configurada.");
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const adapter = new PrismaPg({
  connectionString,
  // Prisma 7 + pg cierra conexiones ociosas a los 10 s por defecto.
  // En MOBIX conviene conservarlas para evitar reconexiones TLS frecuentes a Supabase.
  idleTimeoutMillis: 300_000,
  connectionTimeoutMillis: 5_000,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
