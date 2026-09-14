import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type QueryValue = string | number | undefined;

function hrefFor(pathname: string, query: Record<string, QueryValue>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  const suffix = params.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

export function Pagination({ pathname, page, total, pageSize, query = {} }: {
  pathname: string;
  page: number;
  total: number;
  pageSize: number;
  query?: Record<string, QueryValue>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const current = Math.min(Math.max(1, page), totalPages);
  const pages = Array.from(new Set([
    1,
    current - 1,
    current,
    current + 1,
    totalPages,
  ].filter((value) => value >= 1 && value <= totalPages))).sort((a, b) => a - b);

  return (
    <nav className="mobix-pagination" aria-label="Paginación">
      <Link
        className={`mobix-page-button${current <= 1 ? " disabled" : ""}`}
        href={hrefFor(pathname, query, Math.max(1, current - 1))}
        aria-disabled={current <= 1}
        tabIndex={current <= 1 ? -1 : undefined}
      >
        <ChevronLeft size={15} /> Anterior
      </Link>
      <div className="mobix-page-numbers">
        {pages.map((value, index) => {
          const previous = pages[index - 1];
          return (
            <span className="mobix-page-slot" key={value}>
              {previous && value - previous > 1 && <span className="mobix-page-ellipsis">…</span>}
              <Link
                className={`mobix-page-number${value === current ? " active" : ""}`}
                href={hrefFor(pathname, query, value)}
                aria-current={value === current ? "page" : undefined}
              >
                {value}
              </Link>
            </span>
          );
        })}
      </div>
      <Link
        className={`mobix-page-button${current >= totalPages ? " disabled" : ""}`}
        href={hrefFor(pathname, query, Math.min(totalPages, current + 1))}
        aria-disabled={current >= totalPages}
        tabIndex={current >= totalPages ? -1 : undefined}
      >
        Siguiente <ChevronRight size={15} />
      </Link>
    </nav>
  );
}
