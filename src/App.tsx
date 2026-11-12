import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import LoginPage from '@/pages/LoginPage';
import SetupAdminPage from '@/pages/SetupAdminPage';
import AppLayout from '@/components/layouts/AppLayout';

import { routes } from './routes';

const AppRoutes: React.FC = () => {
  const { isAuthenticated, loading, setupRequired } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="h-3 w-3 animate-pulse rounded-full bg-primary" />
          <span className="text-sm">正在加载…</span>
        </div>
      </div>
    );
  }

  // 首次部署 / 旧版本升级：授权后先完成创建管理员向导，再进入主界面
  if (setupRequired) return <SetupAdminPage />;

  if (!isAuthenticated) return <LoginPage />;

  return (
    <DataProvider>
      <AppLayout>
        <Routes>
          {routes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </DataProvider>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <IntersectObserver />
        <AppRoutes />
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </Router>
  );
};

export default App;
