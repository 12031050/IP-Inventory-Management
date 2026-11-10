import type { ReactNode } from 'react';
import DashboardPage from './pages/DashboardPage';
import IpLedgerPage from './pages/IpLedgerPage';
import SubnetPage from './pages/SubnetPage';
import VlanPage from './pages/VlanPage';
import PoolPage from './pages/PoolPage';
import DevicePage from './pages/DevicePage';
import ImportExportPage from './pages/ImportExportPage';
import BackupPage from './pages/BackupPage';
import UserManagementPage from './pages/UserManagementPage';
import RoleManagementPage from './pages/RoleManagementPage';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  { name: '网络概览', path: '/', element: <DashboardPage /> },
  { name: 'IP台账', path: '/ips', element: <IpLedgerPage /> },
  { name: '子网规划', path: '/subnets', element: <SubnetPage /> },
  { name: 'VLAN管理', path: '/vlans', element: <VlanPage /> },
  { name: '地址池', path: '/pools', element: <PoolPage /> },
  { name: '设备资产', path: '/devices', element: <DevicePage /> },
  { name: '用户管理', path: '/users', element: <UserManagementPage /> },
  { name: '角色管理', path: '/roles', element: <RoleManagementPage /> },
  { name: '导入导出', path: '/io', element: <ImportExportPage /> },
  { name: '备份恢复', path: '/backup', element: <BackupPage /> },
];
