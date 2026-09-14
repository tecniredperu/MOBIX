export default function Loading() {
  return (
    <div className="mobix-route-loading" aria-live="polite" aria-busy="true">
      <div className="mobix-skeleton mobix-skeleton-title" />
      <div className="mobix-skeleton-grid">
        <div className="mobix-skeleton mobix-skeleton-card" />
        <div className="mobix-skeleton mobix-skeleton-card" />
        <div className="mobix-skeleton mobix-skeleton-card" />
        <div className="mobix-skeleton mobix-skeleton-card" />
      </div>
      <div className="mobix-skeleton mobix-skeleton-toolbar" />
      <div className="mobix-skeleton mobix-skeleton-table" />
      <span className="sr-only">Cargando módulo de MOBIX…</span>
    </div>
  );
}
