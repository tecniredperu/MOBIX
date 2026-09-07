-- MOBIX · Flujo válido de estados de postventa
CREATE OR REPLACE FUNCTION mobix_guard_service_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF OLD."status" IN ('DELIVERED','CANCELLED') THEN
    RAISE EXCEPTION 'Una atención cerrada no puede cambiar de estado.';
  END IF;

  IF OLD."status" = 'RECEIVED' AND NEW."status" NOT IN ('DIAGNOSIS','WAITING_APPROVAL','IN_REPAIR','READY','CANCELLED') THEN
    RAISE EXCEPTION 'Transición de estado no permitida desde Recibido.';
  ELSIF OLD."status" = 'DIAGNOSIS' AND NEW."status" NOT IN ('WAITING_APPROVAL','IN_REPAIR','READY','CANCELLED') THEN
    RAISE EXCEPTION 'Transición de estado no permitida desde Diagnóstico.';
  ELSIF OLD."status" = 'WAITING_APPROVAL' AND NEW."status" NOT IN ('DIAGNOSIS','IN_REPAIR','CANCELLED') THEN
    RAISE EXCEPTION 'Transición de estado no permitida desde Esperando aprobación.';
  ELSIF OLD."status" = 'IN_REPAIR' AND NEW."status" NOT IN ('WAITING_APPROVAL','READY','CANCELLED') THEN
    RAISE EXCEPTION 'Transición de estado no permitida desde En reparación.';
  ELSIF OLD."status" = 'READY' AND NEW."status" NOT IN ('IN_REPAIR','DELIVERED','CANCELLED') THEN
    RAISE EXCEPTION 'Transición de estado no permitida desde Listo para entrega.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "service_orders_status_transition_guard" ON "service_orders";
CREATE TRIGGER "service_orders_status_transition_guard"
BEFORE UPDATE OF "status" ON "service_orders"
FOR EACH ROW EXECUTE FUNCTION mobix_guard_service_status_transition();
