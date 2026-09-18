import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { SaleDetailView } from "@/modules/sales/sale-detail-view";
import { getSaleDetail } from "@/modules/sales/sales.repository";

export const dynamic = "force-dynamic";

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requirePermission("sales.view");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const sale = await getSaleDetail(id);
  if (!sale) notFound();
  const created = (Array.isArray(query.created) ? query.created[0] : query.created) === "1";
  const changeParam = Array.isArray(query.change) ? query.change[0] : query.change;
  const parsedChange = Number(changeParam ?? 0);
  const change = Number.isFinite(parsedChange) ? Math.max(0, parsedChange) : 0;
  const exchangeCreditId = Array.isArray(query.exchangeCredit) ? query.exchangeCredit[0] : query.exchangeCredit;
  const exchangeBalanceParam = Array.isArray(query.exchangeBalance) ? query.exchangeBalance[0] : query.exchangeBalance;
  const parsedExchangeBalance = Number(exchangeBalanceParam ?? 0);
  const exchangeBalance = Number.isFinite(parsedExchangeBalance) ? Math.max(0, parsedExchangeBalance) : 0;
  const company = {
    businessName: context.company.businessName,
    tradeName: context.company.tradeName,
    ruc: context.company.ruc,
    email: context.company.email,
    phone: context.company.phone,
    address: context.company.address,
    logoUrl: context.company.logoUrl,
  };

  return (
    <AppShell>
      <SaleDetailView
        sale={sale}
        created={created}
        change={change}
        exchangeCreditId={exchangeCreditId ?? null}
        exchangeBalance={exchangeBalance}
        company={company}
        ticketFooter={context.settings.ticketFooter}
      />
    </AppShell>
  );
}
