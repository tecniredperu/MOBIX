import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { getOperationalContext } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function customerName(customer: { firstName: string | null; lastName: string | null; businessName: string | null }) {
  return customer.businessName || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Cliente";
}

export default async function GlobalSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = (single(params.q) ?? "").trim();
  const { company, membership, permissions } = await getOperationalContext();
  const can = (code: string) => membership.role.isSystem || permissions.has(code);

  const products = q.length >= 2 && can("inventory.view") ? await prisma.product.findMany({
    where: { companyId: company.id, status: "ACTIVE", OR: [
      { name: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { barcode: { contains: q, mode: "insensitive" } },
    ] },
    include: { brand: true }, take: 10, orderBy: { name: "asc" },
  }) : [];

  const identifiers = q.length >= 2 && can("inventory.view") ? await prisma.productUnitIdentifier.findMany({
    where: { companyId: company.id, value: { contains: q, mode: "insensitive" } },
    include: { productUnit: { include: { product: true, variant: true, warehouse: true } } },
    take: 10,
  }) : [];

  const sales = q.length >= 2 && can("sales.view") ? await prisma.sale.findMany({
    where: { companyId: company.id, OR: [
      { saleNumber: { contains: q, mode: "insensitive" } },
      { documentNumber: { contains: q, mode: "insensitive" } },
      { customer: { is: { OR: [
        { documentNumber: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { businessName: { contains: q, mode: "insensitive" } },
      ] } } },
    ] },
    include: { customer: true }, take: 10, orderBy: { createdAt: "desc" },
  }) : [];

  const customers = q.length >= 2 && can("customers.manage") ? await prisma.customer.findMany({
    where: { companyId: company.id, status: "ACTIVE", OR: [
      { documentNumber: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { businessName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { whatsapp: { contains: q, mode: "insensitive" } },
    ] }, take: 10, orderBy: { createdAt: "desc" },
  }) : [];

  const count = products.length + identifiers.length + sales.length + customers.length;
  return (
    <AppShell>
      <div className="page-stack global-search-page">
        <section className="page-heading"><div><span className="eyebrow">BÚSQUEDA GLOBAL</span><h1>{q ? `Resultados para “${q}”` : "Buscar en MOBIX"}</h1><p>{q.length < 2 ? "Escribe al menos dos caracteres en el buscador superior." : `${count} coincidencia(s) visibles según tus permisos.`}</p></div></section>
        {q.length >= 2 && <div className="global-search-results">
          {products.length > 0 && <section className="panel search-result-section"><div className="panel-heading"><div><h2>Productos</h2><p>Catálogo y modelos</p></div></div>{products.map((item)=><Link key={item.id} href={`/productos?q=${encodeURIComponent(item.sku ?? item.name)}`} className="search-result-row"><div><strong>{item.name}</strong><span>{[item.brand?.name,item.model,item.sku].filter(Boolean).join(" · ")}</span></div><b>Producto</b></Link>)}</section>}
          {identifiers.length > 0 && <section className="panel search-result-section"><div className="panel-heading"><div><h2>Equipos / IMEI</h2><p>Unidades serializadas</p></div></div>{identifiers.map((item)=><Link key={item.id} href={`/equipos?q=${encodeURIComponent(item.value)}`} className="search-result-row"><div><strong>{item.value}</strong><span>{item.productUnit.product.name} · {item.productUnit.variant.color ?? "Sin color"} · {item.productUnit.warehouse.name}</span></div><b>{item.type.replace("_"," ")}</b></Link>)}</section>}
          {sales.length > 0 && <section className="panel search-result-section"><div className="panel-heading"><div><h2>Ventas</h2><p>Comprobantes y operaciones</p></div></div>{sales.map((item)=><Link key={item.id} href={`/ventas/${item.id}`} className="search-result-row"><div><strong>{item.saleNumber}</strong><span>{item.customer ? customerName(item.customer) : "Consumidor final"} · {item.documentSeries ?? ""}-{item.documentNumber ?? ""}</span></div><b>S/ {Number(item.total).toFixed(2)}</b></Link>)}</section>}
          {customers.length > 0 && <section className="panel search-result-section"><div className="panel-heading"><div><h2>Clientes</h2><p>Contactos y documentos</p></div></div>{customers.map((item)=><Link key={item.id} href={`/clientes/${item.id}`} className="search-result-row"><div><strong>{customerName(item)}</strong><span>{[item.documentNumber,item.phone].filter(Boolean).join(" · ") || "Sin documento"}</span></div><b>Cliente</b></Link>)}</section>}
          {count === 0 && <section className="panel empty-search-state"><strong>Sin coincidencias</strong><p>No encontramos resultados accesibles para “{q}”.</p></section>}
        </div>}
      </div>
    </AppShell>
  );
}
