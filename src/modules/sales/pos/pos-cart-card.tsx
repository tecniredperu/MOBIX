import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { formatPen, type CartLine } from "./pos-shared";

export function PosCartCard({
  cart,
  onQuantityChange,
  onPriceChange,
  onRemove,
}: {
  cart: CartLine[];
  onQuantityChange: (key: string, quantity: number) => void;
  onPriceChange: (key: string, value: number) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <section className="panel pos-cart-card">
      <div className="pos-card-title">
        <div><ShoppingCart size={18} /><strong>Venta actual</strong></div>
        <span>{cart.length} línea{cart.length === 1 ? "" : "s"}</span>
      </div>
      <div className="pos-cart-lines">
        {cart.map((line) => (
          <div className="pos-cart-line" key={line.key}>
            <div className="pos-cart-line-head">
              <div>
                <strong>{line.name}</strong>
                <span>{line.variant}</span>
                {line.unitLabel && <code>{line.unitLabel}</code>}
              </div>
              <button
                className="row-menu danger"
                type="button"
                onClick={() => onRemove(line.key)}
                aria-label={`Quitar ${line.name}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="pos-cart-controls">
              {line.type === "PHONE" || line.type === "SERIALIZED" ? (
                <span className="fixed-qty">1 und.</span>
              ) : (
                <div className="qty-control">
                  <button type="button" onClick={() => onQuantityChange(line.key, line.quantity - 1)}>
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(event) => onQuantityChange(line.key, Number(event.target.value))}
                  />
                  <button type="button" onClick={() => onQuantityChange(line.key, line.quantity + 1)}>
                    <Plus size={13} />
                  </button>
                </div>
              )}
              <label className="price-control">
                <span>S/</span>
                <input
                  type="number"
                  min={line.minimumSalePrice}
                  step="0.01"
                  value={line.unitPrice}
                  onChange={(event) => onPriceChange(line.key, Number(event.target.value))}
                />
              </label>
              <strong>{formatPen(line.quantity * line.unitPrice)}</strong>
            </div>
          </div>
        ))}

        {!cart.length && (
          <div className="pos-empty-cart">
            <ShoppingCart size={24} />
            <strong>Carrito vacío</strong>
            <span>Agrega productos desde el catálogo.</span>
          </div>
        )}
      </div>
    </section>
  );
}
