
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface OrgMembership {
  organizationId: string;
  organizationName: string;
  roleSlug: string;
  permissions: string[];
}

interface AuthState {
  session: Session | null;
  email: string | null;
  orgs: OrgMembership[];
  currentOrg: OrgMembership | null;
  isPlatformAdmin: boolean;
  accessToken: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadMemberships = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('memberships')
      .select('organization_id, organizations(name), roles(slug, role_permissions(permissions(key)))')
      .eq('user_id', uid)
      .eq('status', 'active');

    const rows = (data ?? []) as Array<{
      organization_id: string;
      organizations: { name?: string } | null;
      roles: { slug?: string; role_permissions?: Array<{ permissions?: { key?: string } }> } | null;
    }>;

    setOrgs(
      rows.map((r) => ({
        organizationId: r.organization_id,
        organizationName: r.organizations?.name ?? 'Workspace',
        roleSlug: r.roles?.slug ?? 'member',
        permissions: (r.roles?.role_permissions ?? [])
          .map((rp) => rp.permissions?.key)
          .filter((k): k is string => typeof k === 'string'),
      })),
    );

    const { data: adminData } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', uid)
      .single();
    
    setIsPlatformAdmin(!!adminData);
  }, []);

  const reload = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session?.user) {
      await loadMemberships(data.session.user.id);
    } else {
      setOrgs([]);
      setIsPlatformAdmin(false);
    }
    setLoading(false);
  }, [loadMemberships]);

  useEffect(() => {
    void reload();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) void loadMemberships(s.user.id);
      else {
        setOrgs([]);
        setIsPlatformAdmin(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [reload, loadMemberships]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setOrgs([]);
    setIsPlatformAdmin(false);
    window.location.href = '/login';
  }, []);

  const currentOrg = orgs[0] ?? null;
  const can = useCallback(
    (permission: string) => !!currentOrg?.permissions.includes(permission),
    [currentOrg],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        email: session?.user.email ?? null,
        orgs,
        currentOrg,
        isPlatformAdmin,
        accessToken: session?.access_token ?? null,
        loading,
        reload,
        logout,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
