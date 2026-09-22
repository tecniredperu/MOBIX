CREATE INDEX "products_company_status_deleted_name_idx"
ON "products"("companyId", "status", "deletedAt", "name");

CREATE INDEX "purchases_company_status_issue_date_idx"
ON "purchases"("companyId", "status", "issueDate");

CREATE INDEX "customers_company_status_updated_idx"
ON "customers"("companyId", "status", "updatedAt");

CREATE INDEX "cash_sessions_company_status_closed_idx"
ON "cash_sessions"("companyId", "status", "closedAt");

CREATE INDEX "audit_logs_company_created_idx"
ON "audit_logs"("companyId", "createdAt");
