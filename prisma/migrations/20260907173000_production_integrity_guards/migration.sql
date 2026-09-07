-- MOBIX · Guardas de integridad para operación concurrente en producción

-- Evita cantidades negativas aunque una futura ruta de código omita una validación.
ALTER TABLE "inventory_balances"
  ADD CONSTRAINT "inventory_balances_quantity_nonnegative"
  CHECK ("quantity" >= 0) NOT VALID;
ALTER TABLE "inventory_balances" VALIDATE CONSTRAINT "inventory_balances_quantity_nonnegative";

-- Una unidad vendida solo puede tener una atención activa de postventa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS "service_orders_one_active_per_unit_idx"
ON "service_orders" ("companyId", "productUnitId")
WHERE "productUnitId" IS NOT NULL AND "status" NOT IN ('DELIVERED','CANCELLED');

-- Protege el límite de crédito ante dos ventas simultáneas del mismo cliente.
CREATE OR REPLACE FUNCTION mobix_guard_credit_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_enabled boolean;
  v_limit numeric(14,2);
  v_outstanding numeric(14,2);
BEGIN
  SELECT "creditEnabled", "creditLimit"
    INTO v_enabled, v_limit
  FROM "customers"
  WHERE "id" = NEW."customerId" AND "companyId" = NEW."companyId"
  FOR UPDATE;

  IF NOT FOUND OR NOT COALESCE(v_enabled, false) THEN
    RAISE EXCEPTION 'El cliente no tiene una línea de crédito activa.';
  END IF;

  SELECT COALESCE(SUM("balance"), 0)
    INTO v_outstanding
  FROM "accounts_receivable"
  WHERE "companyId" = NEW."companyId"
    AND "customerId" = NEW."customerId"
    AND "status" IN ('OPEN','PARTIAL');

  IF v_outstanding + NEW."balance" > COALESCE(v_limit, 0) + 0.01 THEN
    RAISE EXCEPTION 'La operación supera el límite de crédito disponible.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "accounts_receivable_credit_guard" ON "accounts_receivable";
CREATE TRIGGER "accounts_receivable_credit_guard"
BEFORE INSERT ON "accounts_receivable"
FOR EACH ROW EXECUTE FUNCTION mobix_guard_credit_limit();

-- Impide devolver más unidades que las vendidas, incluso con dos solicitudes simultáneas.
CREATE OR REPLACE FUNCTION mobix_guard_return_quantity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sold integer;
  v_returned integer;
BEGIN
  SELECT "quantity"
    INTO v_sold
  FROM "sale_items"
  WHERE "id" = NEW."saleItemId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La línea de venta ya no existe.';
  END IF;

  SELECT COALESCE(SUM(ri."quantity"), 0)::integer
    INTO v_returned
  FROM "return_items" ri
  INNER JOIN "return_orders" ro ON ro."id" = ri."returnOrderId"
  WHERE ri."saleItemId" = NEW."saleItemId"
    AND ro."status" = 'COMPLETED';

  IF NEW."quantity" <= 0 OR v_returned + NEW."quantity" > v_sold THEN
    RAISE EXCEPTION 'La cantidad devuelta supera la cantidad disponible de la venta.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "return_items_quantity_guard" ON "return_items";
CREATE TRIGGER "return_items_quantity_guard"
BEFORE INSERT ON "return_items"
FOR EACH ROW EXECUTE FUNCTION mobix_guard_return_quantity();

-- Toda venta que requiera caja toma un bloqueo compartido sobre el turno abierto.
-- El cierre toma el bloqueo exclusivo desde la aplicación antes de calcular el arqueo.
CREATE OR REPLACE FUNCTION mobix_guard_sale_open_cash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_require boolean;
  v_session text;
BEGIN
  SELECT COALESCE("requireCashSession", true)
    INTO v_require
  FROM "company_settings"
  WHERE "companyId" = NEW."companyId";

  IF COALESCE(v_require, true) THEN
    SELECT "id"
      INTO v_session
    FROM "cash_sessions"
    WHERE "companyId" = NEW."companyId"
      AND "branchId" = NEW."branchId"
      AND "userId" = NEW."createdById"
      AND "status" = 'OPEN'
    ORDER BY "openedAt" DESC
    LIMIT 1
    FOR SHARE;

    IF v_session IS NULL THEN
      RAISE EXCEPTION 'Debes tener una caja abierta en esta sucursal para registrar la venta.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "sales_open_cash_guard" ON "sales";
CREATE TRIGGER "sales_open_cash_guard"
BEFORE INSERT ON "sales"
FOR EACH ROW EXECUTE FUNCTION mobix_guard_sale_open_cash();

-- Movimientos y cobranzas ligados a un turno no pueden entrar después de que este se cierre.
CREATE OR REPLACE FUNCTION mobix_guard_open_cash_session_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_id text;
  v_company_id text;
BEGIN
  IF TG_TABLE_NAME = 'cash_movements' THEN
    v_session_id := NEW."cashSessionId";
    v_company_id := NEW."companyId";
  ELSE
    v_session_id := NEW."cashSessionId";
    v_company_id := NEW."companyId";
    IF v_session_id IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM 1
  FROM "cash_sessions"
  WHERE "id" = v_session_id
    AND "companyId" = v_company_id
    AND "status" = 'OPEN'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La caja asociada a la operación ya está cerrada.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "cash_movements_open_session_guard" ON "cash_movements";
CREATE TRIGGER "cash_movements_open_session_guard"
BEFORE INSERT ON "cash_movements"
FOR EACH ROW EXECUTE FUNCTION mobix_guard_open_cash_session_reference();

DROP TRIGGER IF EXISTS "receivable_payments_open_session_guard" ON "receivable_payments";
CREATE TRIGGER "receivable_payments_open_session_guard"
BEFORE INSERT ON "receivable_payments"
FOR EACH ROW EXECUTE FUNCTION mobix_guard_open_cash_session_reference();
