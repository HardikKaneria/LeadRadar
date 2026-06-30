import { App as AntApp, ConfigProvider } from 'antd';
import { AuthProvider } from '@/lib/auth';
import { radarTheme } from '@/theme/tokens';

/**
 * Global app providers. Order matters: ConfigProvider injects the Radar dark theme, AntApp supplies
 * the static message/notification context (`App.useApp()`), and AuthProvider exposes the Supabase
 * session + RBAC helpers.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={radarTheme}>
      <AntApp
        component="div"
        message={{ top: 76, maxCount: 3 }}
        notification={{ placement: 'bottomRight' }}
      >
        <AuthProvider>{children}</AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}
