import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  basePath: string;
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  query?: Record<string, string | undefined>;
};

function buildHref(basePath: string, targetPage: number, query: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (targetPage > 1) params.set("page", String(targetPage));
  const value = params.toString();
  return value ? `${basePath}?${value}` : basePath;
}

export function Pagination({
  basePath,
  page,
  totalPages,
  totalItems,
  pageSize,
  query = {},
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(totalItems, page * pageSize);

  return (
    <nav className="mobix-pagination" aria-label="Paginación de resultados">
      <span className="mobix-pagination-count">Mostrando {from}–{to} de {totalItems}</span>
      <div className="mobix-pagination-actions">
        {page > 1 ? (
          <Link className="secondary-button pagination-button" href={buildHref(basePath, page - 1, query)}>
            <ChevronLeft size={15} /> Anterior
          </Link>
        ) : (
          <span className="secondary-button pagination-button disabled" aria-disabled="true"><ChevronLeft size={15} /> Anterior</span>
        )}
        <span className="mobix-pagination-page">Página <strong>{page}</strong> de {totalPages}</span>
        {page < totalPages ? (
          <Link className="secondary-button pagination-button" href={buildHref(basePath, page + 1, query)}>
            Siguiente <ChevronRight size={15} />
          </Link>
        ) : (
          <span className="secondary-button pagination-button disabled" aria-disabled="true">Siguiente <ChevronRight size={15} /></span>
        )}
      </div>
    </nav>
  );
}
