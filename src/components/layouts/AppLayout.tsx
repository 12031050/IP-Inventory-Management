import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  List,
  Network,
  Layers,
  Database,
  Server,
  Users,
  ArrowLeftRight,
  HardDriveDownload,
  Menu,
  LogOut,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { type PermissionKey } from '@/types';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: PermissionKey;
}

const rawNavItems: NavItem[] = [
  { to: '/', label: '网络概览', icon: LayoutDashboard },
  { to: '/ips', label: 'IP台账', icon: List, perm: 'ips:view' },
  { to: '/subnets', label: '子网规划', icon: Network, perm: 'subnets:view' },
  { to: '/vlans', label: 'VLAN管理', icon: Layers, perm: 'vlans:view' },
  { to: '/pools', label: '地址池', icon: Database, perm: 'pools:view' },
  { to: '/devices', label: '设备资产', icon: Server, perm: 'devices:view' },
  { to: '/io', label: '导入导出', icon: ArrowLeftRight, perm: 'io:export' },
  { to: '/backup', label: '备份恢复', icon: HardDriveDownload, perm: 'backup:create' },
];

const titleMap: Record<string, string> = {
  '/': '网络概览',
  '/ips': 'IP台账管理',
  '/subnets': '子网规划管理',
  '/vlans': 'VLAN管理',
  '/pools': '地址池管理',
  '/devices': '设备资产管理',
  '/users': '用户管理',
  '/roles': '角色权限管理',
  '/io': '数据导入导出',
  '/backup': '数据备份恢复',
};

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { currentUser, currentRole, isAdmin, hasPermission, logout } = useAuth();
  const location = useLocation();

  const visibleNavItems = rawNavItems.filter((item) => {
    if (isAdmin) return true;
    if (!item.perm) return true;
    return hasPermission(item.perm);
  });

  const canManageUsers = isAdmin || hasPermission('users:view');
  const userActive = location.pathname === '/users' || location.pathname === '/roles';

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/app/ipam/favicon-64.png" alt="IP" className="h-9 w-9 shrink-0 rounded-lg object-contain shadow-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{"IP台账管理"}</p>
              <p className="text-xs font-medium text-emerald-500">{"IPAM  V1.0"}</p>
            </div>
          </div>
          {canManageUsers && (
            <NavLink
              to="/users"
              title="用户管理"
              onClick={onNavigate}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                userActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Users className="h-4 w-4" />
            </NavLink>
          )}
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4 space-y-3">
        {/* 当前登录用户信息与角色 */}
        <div className="rounded-lg bg-sidebar-accent/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <UserCheck className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-sidebar-accent-foreground">
                  {currentUser?.realName || currentUser?.username || '管理员'}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  @{currentUser?.username || 'admin'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={logout}
              title="退出登录"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-sidebar-border/60 pt-2 text-[11px]">
            <span className="text-muted-foreground">身份权限：</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-background/50">
              {currentRole?.name || (isAdmin ? '超级管理员' : '普通用户')}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <span className="h-2 w-2 rounded-full bg-success shrink-0" />
          <span className="truncate">本地数据存储正常</span>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const title = titleMap[location.pathname] ?? 'IP台账管理';

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-border md:flex md:flex-col">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-6 md:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0">
                <SheetTitle className="sr-only">导航菜单</SheetTitle>
                <SidebarContent onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold md:text-xl">{title}</h1>
              <p className="hidden text-xs text-muted-foreground md:block">实时监控本地地址空间 · 多用户权限协同 · 数据不出网</p>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
