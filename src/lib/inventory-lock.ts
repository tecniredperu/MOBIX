type TransactionWithRaw = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

/**
 * Serializa las operaciones que leen y vuelven a calcular un mismo saldo/costo promedio.
 * El advisory lock vive solo durante la transacción PostgreSQL y no bloquea otras variantes.
 */
export async function lockInventoryBalance(
  tx: TransactionWithRaw,
  companyId: string,
  warehouseId: string,
  variantId: string,
) {
  const key = `${companyId}:inventory-balance:${warehouseId}:${variantId}`;
  await tx.$queryRaw`
    WITH lock_row AS (
      SELECT pg_advisory_xact_lock(hashtext(${key}))
    )
    SELECT 1::int AS "locked" FROM lock_row
  `;
}
