import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { formatPen, type CartLine } from "./pos-shared";

export function PosCartCard({
  cart,
  onQuantityChange,
  onPriceChange,
  onRemove,
  onClear,
}: {
  cart: CartLine[];
  onQuantityChange: (key: string, quantity: number) => void;
  onPriceChange: (key: string, value: number) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
}) {
  const units = cart.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <section className="panel pos-cart-card pos-v5-cart-card">
      <div className="pos-card-title pos-cart-premium-title">
        <div>
          <ShoppingCart size={19} />
          <strong>Venta actual ({units})</strong>
        </div>
        {cart.length > 0 && (
          <button className="pos-clear-cart" type="button" onClick={onClear}>
            <Trash2 size={16} />
            Limpiar
          </button>
        )}
      </div>

      <div className="pos-cart-lines">
        {cart.map((line) => {
          const serialized = line.type === "PHONE" || line.type === "SERIALIZED";
          const lineTotal = line.quantity * line.unitPrice;

          return (
            <div className="pos-cart-line pos-cart-premium-line" key={line.key}>
              <div className="pos-cart-product-info">
                <strong title={line.name}>{line.name}</strong>
                <div className="pos-cart-product-meta">
                  <span title={line.variant}>Variante: {line.variant || "Estándar"}</span>
                  {line.unitLabel && <code title={line.unitLabel}>· {line.unitLabel}</code>}
                </div>
              </div>

              <div className="pos-cart-premium-actions">
                {serialized ? (
                  <div className="qty-control pos-cart-qty-control is-fixed" aria-label="Cantidad fija: 1">
                    <button type="button" disabled aria-hidden="true">
                      <Minus size={14} />
                    </button>
                    <input type="number" value={1} readOnly aria-label="Cantidad" />
                    <button type="button" disabled aria-hidden="true">
                      <Plus size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="qty-control pos-cart-qty-control">
                    <button
                      type="button"
                      onClick={() => onQuantityChange(line.key, line.quantity - 1)}
                      aria-label={`Disminuir cantidad de ${line.name}`}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(event) => onQuantityChange(line.key, Number(event.target.value))}
                      aria-label={`Cantidad de ${line.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => onQuantityChange(line.key, line.quantity + 1)}
                      aria-label={`Aumentar cantidad de ${line.name}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}

                <label className="pos-cart-line-price" title="Importe de la línea">
                  <span>S/</span>
                  <input
                    type="number"
                    min={line.minimumSalePrice * line.quantity}
                    step="0.01"
                    value={Number(lineTotal.toFixed(2))}
                    onChange={(event) => {
                      const total = Number(event.target.value);
                      const unitPrice = line.quantity > 0 ? total / line.quantity : total;
                      onPriceChange(line.key, unitPrice);
                    }}
                    aria-label={`Importe de ${line.name}`}
                  />
                </label>

                <button
                  className="pos-cart-remove"
                  type="button"
                  onClick={() => onRemove(line.key)}
                  aria-label={`Quitar ${line.name}`}
                  title={`Eliminar ${line.name}`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}

        {!cart.length && (
          <div className="pos-empty-cart">
            <ShoppingCart size={24} />
            <strong>Carrito vacío</strong>
            <span>Busca un producto o escanea su código / IMEI.</span>
          </div>
        )}
      </div>
    </section>
  );
}
