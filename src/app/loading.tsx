export default function Loading() {
  return (
    <div className="mobix-loading-screen" role="status" aria-live="polite" aria-label="Cargando contenido">
      <div className="mobix-loading-sidebar" aria-hidden="true" />
      <main className="mobix-loading-main">
        <div className="mobix-skeleton mobix-skeleton-title" />
        <div className="mobix-skeleton mobix-skeleton-subtitle" />
        <div className="mobix-loading-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="mobix-skeleton mobix-skeleton-card" key={index} />
          ))}
        </div>
        <div className="mobix-skeleton mobix-skeleton-table" />
      </main>
    </div>
  );
}
