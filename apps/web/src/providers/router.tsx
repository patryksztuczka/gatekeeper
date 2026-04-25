import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthLayout } from '../components/layouts/auth-layout';
import { DashboardLayout } from '../components/layouts/dashboard-layout';
import { GuestOnlyRoute } from '../features/auth/guest-only-route';
import { OrganizationRoute } from '../features/auth/organization-route';
import { ProtectedRoute } from '../features/auth/protected-route';

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
                  const { SignInPage } = await import('../components/pages/sign-in');
                  return { Component: SignInPage };
                },
              },
              {
                path: '/sign-up',
                lazy: async () => {
                  const { SignUpPage } = await import('../components/pages/sign-up');
                  return { Component: SignUpPage };
                },
              },
              {
                path: '/forgot-password',
                lazy: async () => {
                  const { ForgotPasswordPage } =
                    await import('../components/pages/forgot-password');
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
              const { InvitationPage } = await import('../components/pages/invitation');
              return { Component: InvitationPage };
            },
          },
          {
            path: '/verify-email',
            lazy: async () => {
              const { VerifyEmailPage } = await import('../components/pages/verify-email');
              return { Component: VerifyEmailPage };
            },
          },
          {
            path: '/verify-email/callback',
            lazy: async () => {
              const { VerifyEmailCallbackPage } =
                await import('../components/pages/verify-email-callback');
              return { Component: VerifyEmailCallbackPage };
            },
          },
          {
            path: '/reset-password',
            lazy: async () => {
              const { ResetPasswordPage } = await import('../components/pages/reset-password');
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
              const { HomePage } = await import('../components/pages/home');
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
                      const { HomePage } = await import('../components/pages/home');
                      return { Component: HomePage };
                    },
                  },
                  {
                    path: 'settings',
                    lazy: async () => {
                      const { SettingsPage } = await import('../components/pages/settings');
                      return { Component: SettingsPage };
                    },
                  },
                  ...['projects', 'checklists', 'controls', 'exceptions', 'audit'].map((path) => ({
                    path,
                    lazy: async () => {
                      const { StaticAppPage } = await import('../components/pages/static-app-page');
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
