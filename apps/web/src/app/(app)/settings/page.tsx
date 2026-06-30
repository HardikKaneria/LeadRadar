import { Navigate } from 'react-router-dom';
import { Result } from 'antd';
import { useAuth } from '@/lib/auth';
import { getVisibleSettingsSections } from '@/components/settings/settings-sections';

export default function SettingsPage() {
  const { can } = useAuth();
  const firstVisibleSection = getVisibleSettingsSections(can)[0] ?? null;

  if (!firstVisibleSection) {
    return (
      <Result
        status="403"
        title="No settings sections are available for this role"
        subTitle="Ask a company admin to grant access to a workspace settings area."
      />
    );
  }

  return <Navigate to={firstVisibleSection.href} replace />;
}
