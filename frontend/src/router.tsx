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
import ProcessingProductsPage from './pages/Orders/ProcessingProducts';
import OrderDetailPage from './pages/Orders/OrderDetail';
import SearchOrdersPage from './pages/Orders/SearchOrders';
import UsersPage from './pages/Admin/Users';
import SystemPage from './pages/Admin/System';
import RefundsPage from './pages/Refunds';
import RedoDetailPage from './pages/Redos/RedoDetail';
import ReportsPage from './pages/Reports';
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
      // Consolidated dry/frozen pick lists across processing orders (role-scoped).
      { path: 'processing/products/:type', element: <ProcessingProductsPage /> },
      { path: 'completed', element: <OrdersPage view="completed" /> },
      // A redo opens in its own detail (worked like an order); it surfaces inside
      // the Processing / Completed lists, not a separate Redos area.
      { path: 'redos/:id', element: <RedoDetailPage /> },
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
            <ReportsPage />
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
            <SystemPage />
          </RoleGuard>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
