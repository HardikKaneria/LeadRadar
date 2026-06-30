import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

// Layouts stay eager — they're small and gate every route.
import AppLayout from '@/app/(app)/layout';
import AdminLayout from '@/app/(admin)/layout';
import { SettingsWorkspace } from '@/components/settings/settings-workspace';

// Pages are lazy-loaded so antd-heavy screens split out of the initial bundle.
const LoginPage = lazy(() => import('@/app/(auth)/login/page'));
const RegisterPage = lazy(() => import('@/app/(auth)/register/page'));
const NotFoundPage = lazy(() => import('@/app/not-found/page'));

const DashboardPage = lazy(() => import('@/app/(app)/page'));
const InboxPage = lazy(() => import('@/app/(app)/inbox/page'));
const CapturePage = lazy(() => import('@/app/(app)/capture/page'));
const LeadHuntingPage = lazy(() => import('@/app/(app)/lead-hunting/page'));
const LeadHuntingReviewPage = lazy(() => import('@/app/(app)/lead-hunting/review/page'));
const LeadHuntingArchivePage = lazy(() => import('@/app/(app)/lead-hunting/archive/page'));
const LeadHuntingSessionPage = lazy(() => import('@/app/(app)/lead-hunting/sessions/[id]/page'));
const LeadHuntingPostPage = lazy(() => import('@/app/(app)/lead-hunting/posts/[id]/page'));
const OpportunitiesPage = lazy(() => import('@/app/(app)/opportunities/page'));
const DemandRadarPage = lazy(() => import('@/app/(app)/opportunities/radar/page'));
const PipelinePage = lazy(() => import('@/app/(app)/pipeline/page'));
const TasksPage = lazy(() => import('@/app/(app)/tasks/page'));
const CompaniesPage = lazy(() => import('@/app/(app)/companies/page'));
const KnowledgePage = lazy(() => import('@/app/(app)/knowledge/page'));
const ForecastPage = lazy(() => import('@/app/(app)/forecast/page'));
const JobsPage = lazy(() => import('@/app/(app)/jobs/page'));
const SettingsPage = lazy(() => import('@/app/(app)/settings/page'));
const SettingsAiPage = lazy(() => import('@/app/(app)/settings/ai/page'));
const SettingsCompanyBrainPage = lazy(() => import('@/app/(app)/settings/company-brain/page'));
const SettingsExtensionPage = lazy(() => import('@/app/(app)/settings/extension/page'));
const SettingsTemplatesPage = lazy(() => import('@/app/(app)/settings/templates/page'));
const SettingsIntegrationsPage = lazy(() => import('@/app/(app)/settings/integrations/page'));
const SettingsBillingPage = lazy(() => import('@/app/(app)/settings/billing/page'));
const SettingsRolesPermissionsPage = lazy(() => import('@/app/(app)/settings/roles-permissions/page'));
const SettingsAuditPage = lazy(() => import('@/app/(app)/settings/audit/page'));
const SettingsSecurityPage = lazy(() => import('@/app/(app)/settings/security/page'));
const SettingsNotificationsPage = lazy(() => import('@/app/(app)/settings/notifications/page'));

const AdminDashboardPage = lazy(() => import('@/app/(admin)/admin/page'));
const AdminAiProvidersPage = lazy(() => import('@/app/(admin)/admin/ai-providers/page'));
const AdminExternalProvidersPage = lazy(() => import('@/app/(admin)/admin/external-providers/page'));
const AdminCompaniesPage = lazy(() => import('@/app/(admin)/admin/companies/page'));
const AdminHealthPage = lazy(() => import('@/app/(admin)/admin/health/page'));
const AdminJobsPage = lazy(() => import('@/app/(admin)/admin/jobs/page'));
const AdminPromptsPage = lazy(() => import('@/app/(admin)/admin/prompts/page'));
const AdminRoutingPage = lazy(() => import('@/app/(admin)/admin/routing/page'));
const AdminUsagePage = lazy(() => import('@/app/(admin)/admin/usage/page'));
const AdminUsersPage = lazy(() => import('@/app/(admin)/admin/users/page'));
const AdminBillingPage = lazy(() => import('@/app/(admin)/admin/billing/page'));
const AdminAuditPage = lazy(() => import('@/app/(admin)/admin/audit/page'));

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/inbox', element: <InboxPage /> },
      { path: '/capture', element: <CapturePage /> },
      { path: '/lead-hunting', element: <LeadHuntingPage /> },
      { path: '/lead-hunting/review', element: <LeadHuntingReviewPage /> },
      { path: '/lead-hunting/archive', element: <LeadHuntingArchivePage /> },
      { path: '/lead-hunting/sessions/:id', element: <LeadHuntingSessionPage /> },
      { path: '/lead-hunting/posts/:id', element: <LeadHuntingPostPage /> },
      { path: '/opportunities', element: <OpportunitiesPage /> },
      { path: '/opportunities/radar', element: <DemandRadarPage /> },
      { path: '/pipeline', element: <PipelinePage /> },
      { path: '/tasks', element: <TasksPage /> },
      { path: '/companies', element: <CompaniesPage /> },
      { path: '/knowledge', element: <KnowledgePage /> },
      { path: '/forecast', element: <ForecastPage /> },
      { path: '/jobs', element: <JobsPage /> },
      { path: '/settings', element: <SettingsPage /> },
      {
        path: '/settings/ai',
        element: (
          <SettingsWorkspace sectionKey="ai">
            <SettingsAiPage />
          </SettingsWorkspace>
        ),
      },
      {
        path: '/settings/company-brain',
        element: (
          <SettingsWorkspace sectionKey="company-brain">
            <SettingsCompanyBrainPage />
          </SettingsWorkspace>
        ),
      },
      {
        path: '/settings/extension',
        element: (
          <SettingsWorkspace sectionKey="extension">
            <SettingsExtensionPage />
          </SettingsWorkspace>
        ),
      },
      {
        path: '/settings/templates',
        element: (
          <SettingsWorkspace sectionKey="templates">
            <SettingsTemplatesPage />
          </SettingsWorkspace>
        ),
      },
      {
        path: '/settings/integrations',
        element: (
          <SettingsWorkspace sectionKey="integrations">
            <SettingsIntegrationsPage />
          </SettingsWorkspace>
        ),
      },
      {
        path: '/settings/billing',
        element: (
          <SettingsWorkspace sectionKey="billing">
            <SettingsBillingPage />
          </SettingsWorkspace>
        ),
      },
      {
        path: '/settings/roles-permissions',
        element: (
          <SettingsWorkspace sectionKey="roles-permissions">
            <SettingsRolesPermissionsPage />
          </SettingsWorkspace>
        ),
      },
      {
        path: '/settings/audit',
        element: (
          <SettingsWorkspace sectionKey="audit">
            <SettingsAuditPage />
          </SettingsWorkspace>
        ),
      },
      {
        path: '/settings/security',
        element: (
          <SettingsWorkspace sectionKey="security">
            <SettingsSecurityPage />
          </SettingsWorkspace>
        ),
      },
      { path: '/notifications', element: <Navigate to="/settings/notifications" replace /> },
      {
        path: '/settings/notifications',
        element: (
          <SettingsWorkspace sectionKey="notifications">
            <SettingsNotificationsPage />
          </SettingsWorkspace>
        ),
      },
    ],
  },
  {
    element: <AdminLayout />,
    children: [
      { path: '/admin', element: <AdminDashboardPage /> },
      { path: '/admin/ai-providers', element: <AdminAiProvidersPage /> },
      { path: '/admin/external-providers', element: <AdminExternalProvidersPage /> },
      { path: '/admin/companies', element: <AdminCompaniesPage /> },
      { path: '/admin/health', element: <AdminHealthPage /> },
      { path: '/admin/jobs', element: <AdminJobsPage /> },
      { path: '/admin/prompts', element: <AdminPromptsPage /> },
      { path: '/admin/routing', element: <AdminRoutingPage /> },
      { path: '/admin/usage', element: <AdminUsagePage /> },
      { path: '/admin/users', element: <AdminUsersPage /> },
      { path: '/admin/billing', element: <AdminBillingPage /> },
      { path: '/admin/audit', element: <AdminAuditPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
