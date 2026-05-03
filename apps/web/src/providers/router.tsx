import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthLayout } from '../components/layouts/auth-layout';
import { DashboardLayout } from '../components/layouts/dashboard-layout';
import { GuestOnlyRoute } from '../features/auth/components/guest-only-route';
import { OrganizationRoute } from '../features/auth/components/organization-route';
import { ProtectedRoute } from '../features/auth/components/protected-route';

const router = createBrowserRouter([
  {
    children: [
      {
        element: <GuestOnlyRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              {
                path: '/sign-in',
                lazy: async () => {
                  const { SignInPage } = await import('../features/auth/pages/sign-in');
                  return { Component: SignInPage };
                },
              },
              {
                path: '/sign-up',
                lazy: async () => {
                  const { SignUpPage } = await import('../features/auth/pages/sign-up');
                  return { Component: SignUpPage };
                },
              },
              {
                path: '/forgot-password',
                lazy: async () => {
                  const { ForgotPasswordPage } =
                    await import('../features/auth/pages/forgot-password');
                  return { Component: ForgotPasswordPage };
                },
              },
            ],
          },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          {
            path: '/invite/:invitationId',
            lazy: async () => {
              const { InvitationPage } = await import('../features/organizations/pages/invitation');
              return { Component: InvitationPage };
            },
          },
          {
            path: '/verify-email',
            lazy: async () => {
              const { VerifyEmailPage } = await import('../features/auth/pages/verify-email');
              return { Component: VerifyEmailPage };
            },
          },
          {
            path: '/verify-email/callback',
            lazy: async () => {
              const { VerifyEmailCallbackPage } =
                await import('../features/auth/pages/verify-email-callback');
              return { Component: VerifyEmailCallbackPage };
            },
          },
          {
            path: '/reset-password',
            lazy: async () => {
              const { ResetPasswordPage } = await import('../features/auth/pages/reset-password');
              return { Component: ResetPasswordPage };
            },
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: '/',
            lazy: async () => {
              const { HomePage } = await import('../features/app-shell/pages/home');
              return { Component: HomePage };
            },
          },
          {
            element: <OrganizationRoute />,
            children: [
              {
                path: '/:organizationSlug',
                element: <DashboardLayout />,
                children: [
                  {
                    index: true,
                    lazy: async () => {
                      const { HomePage } = await import('../features/app-shell/pages/home');
                      return { Component: HomePage };
                    },
                  },
                  {
                    path: 'settings',
                    lazy: async () => {
                      const { SettingsPage } =
                        await import('../features/organizations/pages/settings');
                      return { Component: SettingsPage };
                    },
                  },
                  {
                    path: 'projects',
                    lazy: async () => {
                      const { ProjectsPage } = await import('../features/projects/pages/projects');
                      return { Component: ProjectsPage };
                    },
                  },
                  {
                    path: 'controls',
                    lazy: async () => {
                      const { ControlsPage } = await import('../features/controls/pages/controls');
                      return { Component: ControlsPage };
                    },
                  },
                  {
                    path: 'p/:projectSlug',
                    lazy: async () => {
                      const { ProjectDetailPage } =
                        await import('../features/projects/pages/project-detail');
                      return { Component: ProjectDetailPage };
                    },
                  },
                  {
                    path: 'p/:projectSlug/settings',
                    lazy: async () => {
                      const { ProjectSettingsPage } =
                        await import('../features/projects/pages/project-settings');
                      return { Component: ProjectSettingsPage };
                    },
                  },
                  ...['checklists', 'exceptions', 'audit'].map((path) => ({
                    path,
                    lazy: async () => {
                      const { StaticAppPage } =
                        await import('../features/app-shell/pages/static-app-page');
                      return { Component: StaticAppPage };
                    },
                  })),
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
