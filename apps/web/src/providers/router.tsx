import { createBrowserRouter, RouterProvider } from 'react-router';
import { GuestOnlyRoute } from '../components/auth/guest-only-route';
import { ProtectedRoute } from '../components/auth/protected-route';
import { AuthLayout } from '../components/layouts/auth-layout';

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
            ],
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
        ],
      },
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
