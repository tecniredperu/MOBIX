"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Edit3,
  Plus,
  Search,
  Tags,
  X,
} from "lucide-react";

export type CatalogManagerItem = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  productCount: number;
  updatedAt: string;
};

type CatalogKind = "category" | "brand";

type ApiOption = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

export function CatalogManager({
  kind,
  title,
  description,
  singularLabel,
  pluralLabel,
  initialItems,
  canManage,
}: {
  kind: CatalogKind;
  title: string;
  description: string;
  singularLabel: string;
  pluralLabel: string;
  initialItems: CatalogManagerItem[];
  canManage: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    if (!q) return items;
    return items.filter((item) => item.name.toLocaleLowerCase("es").includes(q));
  }, [items, query]);

  const activeCount = items.filter((item) => item.status === "ACTIVE").length;
  const usedCount = items.filter((item) => item.productCount > 0).length;

  const callApi = async (method: "POST" | "PATCH", body: Record<string, unknown>) => {
    const response = await fetch("/api/catalog/options", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({})) as { option?: ApiOption; error?: string };
    if (!response.ok || !data.option) {
      throw new Error(data.error ?? "No se pudo completar la operación.");
    }
    return data.option;
  };

  const createItem = () => {
    const name = newName.trim();
    setError(null);
    if (name.length < 2) {
      setError(`Ingresa un nombre válido para la ${singularLabel.toLowerCase()}.`);
      return;
    }

    startTransition(async () => {
      try {
        const option = await callApi("POST", { kind, name });
        setItems((current) => {
          const existing = current.find((item) => item.id === option.id);
          const now = new Date().toISOString();
          if (existing) {
            return current
              .map((item) => item.id === option.id
                ? { ...item, name: option.name, status: option.status, updatedAt: now }
                : item)
              .sort((a, b) => a.name.localeCompare(b.name, "es"));
          }
          return [
            ...current,
            { id: option.id, name: option.name, status: option.status, productCount: 0, updatedAt: now },
          ].sort((a, b) => a.name.localeCompare(b.name, "es"));
        });
        setNewName("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
      }
    });
  };

  const saveEdit = (item: CatalogManagerItem) => {
    const name = editingName.trim();
    setError(null);
    if (name.length < 2) {
      setError("El nombre debe tener al menos 2 caracteres.");
      return;
    }

    startTransition(async () => {
      try {
        const option = await callApi("PATCH", { kind, id: item.id, name });
        setItems((current) => current
          .map((entry) => entry.id === item.id
            ? { ...entry, name: option.name, status: option.status, updatedAt: new Date().toISOString() }
            : entry)
          .sort((a, b) => a.name.localeCompare(b.name, "es")));
        setEditingId(null);
        setEditingName("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo actualizar.");
      }
    });
  };

  const toggleStatus = (item: CatalogManagerItem) => {
    const nextStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setError(null);
    startTransition(async () => {
      try {
        const option = await callApi("PATCH", { kind, id: item.id, status: nextStatus });
        setItems((current) => current.map((entry) => entry.id === item.id
          ? { ...entry, status: option.status, updatedAt: new Date().toISOString() }
          : entry));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado.");
      }
    });
  };

  return (
    <div className="page-stack catalog-manager-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">CATÁLOGO</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>

      <section className="catalog-summary-grid" aria-label={`Resumen de ${pluralLabel.toLowerCase()}`}>
        <article>
          <span>Total</span>
          <strong>{items.length}</strong>
          <small>{pluralLabel} registradas</small>
        </article>
        <article>
          <span>Activas</span>
          <strong>{activeCount}</strong>
          <small>Disponibles para nuevos productos</small>
        </article>
        <article>
          <span>En uso</span>
          <strong>{usedCount}</strong>
          <small>Con uno o más productos asociados</small>
        </article>
      </section>

      {canManage && (
        <section className="panel catalog-create-panel">
          <div className="catalog-create-copy">
            <div className="catalog-create-icon"><Tags size={20} /></div>
            <div>
              <strong>Nueva {singularLabel.toLowerCase()}</strong>
              <span>Créala aquí y quedará disponible inmediatamente al registrar productos.</span>
            </div>
          </div>
          <div className="catalog-create-controls">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  createItem();
                }
              }}
              placeholder={`Nombre de la ${singularLabel.toLowerCase()}`}
              disabled={pending}
            />
            <button type="button" className="primary-button" onClick={createItem} disabled={pending}>
              <Plus size={17} /> Crear
            </button>
          </div>
        </section>
      )}

      {error && <div className="form-alert catalog-alert" role="alert"><span>{error}</span></div>}

      <section className="panel table-panel catalog-table-panel">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar ${pluralLabel.toLowerCase()}...`}
            />
          </div>
          <span className="catalog-toolbar-note">
            No se eliminan registros usados; se activan o desactivan para conservar el historial.
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table catalog-table">
            <thead>
              <tr>
                <th>{singularLabel}</th>
                <th className="right">Productos</th>
                <th>Estado</th>
                <th>Última actualización</th>
                {canManage && <th className="right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    {editingId === item.id ? (
                      <div className="catalog-inline-edit">
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              saveEdit(item);
                            }
                            if (event.key === "Escape") {
                              setEditingId(null);
                              setEditingName("");
                            }
                          }}
                          autoFocus
                          disabled={pending}
                        />
                        <button type="button" className="catalog-icon-button success" onClick={() => saveEdit(item)} disabled={pending} aria-label="Guardar cambios">
                          <Check size={16} />
                        </button>
                        <button type="button" className="catalog-icon-button" onClick={() => { setEditingId(null); setEditingName(""); }} disabled={pending} aria-label="Cancelar edición">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="catalog-name-cell">
                        <strong>{item.name}</strong>
                        <span>{item.productCount === 0 ? "Aún sin productos" : `${item.productCount} producto${item.productCount === 1 ? "" : "s"} asociado${item.productCount === 1 ? "" : "s"}`}</span>
                      </div>
                    )}
                  </td>
                  <td className="right"><strong>{item.productCount}</strong></td>
                  <td><span className={`status-badge${item.status === "INACTIVE" ? " inactive" : ""}`}>{item.status === "ACTIVE" ? "Activa" : "Inactiva"}</span></td>
                  <td>{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(item.updatedAt))}</td>
                  {canManage && (
                    <td className="right">
                      <div className="catalog-actions">
                        <button
                          type="button"
                          className="secondary-button compact-action"
                          disabled={pending || editingId === item.id}
                          onClick={() => { setEditingId(item.id); setEditingName(item.name); setError(null); }}
                        >
                          <Edit3 size={15} /> Editar
                        </button>
                        <button
                          type="button"
                          className={`secondary-button compact-action${item.status === "ACTIVE" ? " danger-soft" : " success-soft"}`}
                          disabled={pending}
                          onClick={() => toggleStatus(item)}
                        >
                          {item.status === "ACTIVE" ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 5 : 4}>
                    <div className="empty-table-state">
                      <Search size={22} />
                      <strong>No encontramos {pluralLabel.toLowerCase()}</strong>
                      <span>{query ? "Prueba con otro término de búsqueda." : `Aún no hay ${pluralLabel.toLowerCase()} registradas.`}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{filtered.length} de {items.length} {pluralLabel.toLowerCase()}</span>
          <span>Los productos existentes conservan su referencia aunque el registro se desactive.</span>
        </div>
      </section>
    </div>
  );
}
