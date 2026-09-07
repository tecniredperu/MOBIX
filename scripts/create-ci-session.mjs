import crypto from "node:crypto";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const secret = process.env.AUTH_SECRET;
if (!connectionString || !secret) throw new Error("DATABASE_URL y AUTH_SECRET son obligatorios.");

const client = new pg.Client({ connectionString });
await client.connect();
const { rows } = await client.query(`
  SELECT cu."userId", cu."companyId"
  FROM "company_users" cu
  JOIN "users" u ON u."id" = cu."userId"
  JOIN "companies" c ON c."id" = cu."companyId"
  WHERE cu."status" = 'ACTIVE' AND u."status" = 'ACTIVE' AND c."status" = 'ACTIVE'
  ORDER BY cu."createdAt" ASC
  LIMIT 1
`);
await client.end();
if (!rows[0]) throw new Error("No existe un usuario activo para el smoke test.");

const payload = {
  v: 1,
  userId: rows[0].userId,
  companyId: rows[0].companyId,
  exp: Date.now() + 60 * 60 * 1000,
};
const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
process.stdout.write(`${body}.${signature}`);
