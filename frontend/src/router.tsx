import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RoleGuard } from './components/auth/RoleGuard';
import { Roles } from '@shared';
import LoginPage from './pages/Login';
import ChangePasswordPage from './pages/ChangePassword';
import SystemLockPage from './pages/SystemLock';
import HomePage from './pages/Home';
import OrdersPage from './pages/Orders';
import SelectOrdersPage from './pages/Orders/SelectOrders';
import ProcessingPage from './pages/Orders/Processing';
import OrderDetailPage from './pages/Orders/OrderDetail';
import SearchOrdersPage from './pages/Orders/SearchOrders';
import UsersPage from './pages/Admin/Users';
import RefundsPage from './pages/Refunds';
import NotificationsPage from './pages/Notifications';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/system-locked', element: <SystemLockPage /> },
  {
    path: '/change-password',
    element: (
      <RoleGuard>
        <ChangePasswordPage />
      </RoleGuard>
    ),
  },
  {
    path: '/',
    element: (
      <RoleGuard>
        <AppShell />
      </RoleGuard>
    ),
    children: [
      { index: true, element: <HomePage /> },
      // The Order page is Admin and above: pick live WooCommerce orders to process.
      {
        path: 'orders',
        element: (
          <RoleGuard minRole={Roles.ADMIN}>
            <SelectOrdersPage />
          </RoleGuard>
        ),
      },
      // Shared order detail, keyed by the WooCommerce order id (opens for any role).
      { path: 'orders/:orderId', element: <OrderDetailPage /> },
      { path: 'processing', element: <ProcessingPage /> },
      { path: 'completed', element: <OrdersPage view="completed" /> },
      // Global order search — pulls live from WooCommerce (all roles).
      { path: 'search', element: <SearchOrdersPage /> },
      {
        path: 'notifications',
        element: (
          <RoleGuard minRole={Roles.ADMIN}>
            <NotificationsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'reports',
        element: (
          <RoleGuard minRole={Roles.SUPERVISOR}>
            <Placeholder title="Reports" />
          </RoleGuard>
        ),
      },
      {
        path: 'refunds',
        element: (
          <RoleGuard minRole={Roles.ADMIN}>
            <RefundsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/users',
        element: (
          <RoleGuard minRole={Roles.ADMIN}>
            <UsersPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/system',
        element: (
          <RoleGuard minRole={Roles.ADMIN}>
            <Placeholder title="System controls (admin)" />
          </RoleGuard>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

function Placeholder({ title }: { title: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-500 mt-1">Coming in a later slice.</p>
    </div>
  );
}
