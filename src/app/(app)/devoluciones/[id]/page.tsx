import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/business-context";
import { ReturnDetailView } from "@/modules/returns/return-detail-view";
import { getReturnDetail } from "@/modules/returns/returns.repository";

export const dynamic = "force-dynamic";

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, context] = await Promise.all([
    params,
    requirePermission("returns.manage"),
  ]);
  const detail = await getReturnDetail(id);
  if (!detail) notFound();

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
    <>
      <ReturnDetailView detail={detail} company={company} />
    </>
  );
}
