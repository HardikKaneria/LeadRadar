
import { useAuth } from '@/lib/auth';
import { Result } from 'antd';
import { CompanyAdminDashboard } from '@/components/dashboards/company-admin-dashboard';
import { SalesExecutiveDashboard } from '@/components/dashboards/sales-executive-dashboard';
import { PageHeader } from '@/components/page-header';

export default function HomePage() {
  const { currentOrg, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader eyebrow="Loading" title="Loading Dashboard..." />
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <Result
        status="info"
        title="No workspace yet"
        subTitle="Join or create a workspace to see your dashboard."
      />
    );
  }

  // Master admins also get the company admin view for the active org
  if (currentOrg.roleSlug === 'company_admin' || currentOrg.roleSlug === 'master_admin') {
    return <CompanyAdminDashboard />;
  }

  // Default / Sales Exec view
  return <SalesExecutiveDashboard />;
}
