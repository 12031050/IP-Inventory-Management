import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { readJSON, writeJSON, genId, nowISO } from '@/lib/storage';
import { loginWithNasApi, loginWithPasswordApi, getNasUser, getUsersApi, saveUsersApi, getRolesApi, saveRolesApi, type NasUserInfo } from '@/lib/api';
import {
  type User,
  type Role,
  type PermissionKey,
  ALL_PERMISSIONS,
} from '@/types';

// 系统预置角色
export const SYSTEM_ROLES: Role[] = [
  {
    id: 'role-admin',
    name: '管理员',
    description: '拥有系统全部权限，包括用户与角色管理配置',
    isSystem: true,
    permissions: [...ALL_PERMISSIONS],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-operator',
    name: '运维员',
    description: '拥有 IP 台账、子网、VLAN、地址池、设备资产管理与数据导入导出权限',
    isSystem: true,
    permissions: [
      'ips:view',
      'ips:create',
      'ips:edit',
      'ips:delete',
      'subnets:view',
      'subnets:create',
      'subnets:edit',
      'subnets:delete',
      'vlans:view',
      'vlans:create',
      'vlans:edit',
      'vlans:delete',
      'pools:view',
      'pools:create',
      'pools:edit',
      'pools:delete',
      'devices:view',
      'devices:create',
      'devices:edit',
      'devices:delete',
      'io:import',
      'io:export',
      'backup:create',
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-viewer',
    name: '只读用户',
    description: '仅具备 IP 台账、子网、VLAN、地址池、设备资产的查看与导出权限',
    isSystem: true,
    permissions: [
      'ips:view',
      'subnets:view',
      'vlans:view',
      'pools:view',
      'devices:view',
      'io:export',
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const USERS_KEY = 'app_users_v2';
const ROLES_KEY = 'app_roles_v2';
const SESSION_KEY = 'session_user_id';
const SESSION_LOGIN_TYPE_KEY = 'session_login_type';
const LEGACY_USERS_KEY = 'users';

interface AuthContextType {
  currentUser: User | null;
  currentRole: Role | null;
  username: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  hasUsers: boolean;
  isAdmin: boolean;
  nasInfo: NasUserInfo | null;
  // 权限检查
  hasPermission: (perm: PermissionKey) => boolean;
  // 认证
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginWithNas: () => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  // 用户管理
  users: User[];
  addUser: (user: { username: string; realName: string; password: string; roleId: string }) => { ok: boolean; error?: string };
  updateUser: (id: string, user: Partial<Omit<User, 'id' | 'createdAt'>>) => { ok: boolean; error?: string };
  deleteUser: (id: string) => { ok: boolean; error?: string };
  resetUserPassword: (id: string, newPassword?: string) => { ok: boolean; error?: string; password?: string };
  toggleUserStatus: (id: string) => { ok: boolean; error?: string };
  // 角色管理
  roles: Role[];
  addRole: (role: { name: string; description: string; permissions: PermissionKey[] }) => { ok: boolean; error?: string };
  updateRole: (id: string, role: { name?: string; description?: string; permissions?: PermissionKey[] }) => { ok: boolean; error?: string };
  deleteRole: (id: string) => { ok: boolean; error?: string };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [nasInfo, setNasInfo] = useState<NasUserInfo | null>(null);

  // 初始化角色
  const [roles, setRoles] = useState<Role[]>(() => {
    const stored = readJSON<Role[]>(ROLES_KEY, []);
    if (!stored || stored.length === 0) {
      writeJSON(ROLES_KEY, SYSTEM_ROLES);
      return SYSTEM_ROLES;
    }
    const existingIds = new Set(stored.map((r) => r.id));
    const missing = SYSTEM_ROLES.filter((r) => !existingIds.has(r.id));
    if (missing.length > 0) {
      const merged = [...stored, ...missing];
      writeJSON(ROLES_KEY, merged);
      return merged;
    }
    return stored;
  });

  // 初始化用户列表（包含从旧版本自动迁移及预置用户）
  const [users, setUsers] = useState<User[]>(() => {
    const stored = readJSON<User[]>(USERS_KEY, []);
    if (stored && stored.length > 0) return stored;

    const legacy = readJSON<{ username: string; password: string }[]>(LEGACY_USERS_KEY, []);
    if (legacy && legacy.length > 0) {
      const migrated: User[] = legacy.map((l, idx) => ({
        id: genId(),
        username: l.username,
        realName: l.username === 'admin' ? '系统管理员' : l.username,
        password: l.password,
        roleId: idx === 0 ? 'role-admin' : 'role-operator',
        status: 'active',
        createdAt: nowISO(),
      }));
      writeJSON(USERS_KEY, migrated);
      return migrated;
    }

    // 系统初始化不预置任何用户，首个飞牛授权登录用户自动成为超级管理员
    writeJSON(USERS_KEY, []);
    return [];
  });

  // 同步状态到 localStorage 与 SQLite 后端
  useEffect(() => {
    writeJSON(ROLES_KEY, roles);
    if (!loading) saveRolesApi(roles);
  }, [roles, loading]);

  useEffect(() => {
    writeJSON(USERS_KEY, users);
    if (!loading) saveUsersApi(users);
  }, [users, loading]);

  // 会话初始化与 NAS 环境检测，并从 SQLite 加载用户/角色（跨设备持久化）
  useEffect(() => {
    async function initAuth() {
      try {
        const nas = await getNasUser();
        setNasInfo(nas);
      } catch {
        // 忽略
      }

      // 从后端 SQLite 加载用户与角色（跨设备持久化的真实数据源）
      let loadedUsers: User[] = [];
      let loadedRoles: Role[] = [];
      try {
        [loadedUsers, loadedRoles] = await Promise.all([getUsersApi(), getRolesApi()]);
      } catch {
        // 降级使用本地数据
      }

      if (loadedRoles.length > 0) {
        const existingIds = new Set(loadedRoles.map((r) => r.id));
        const missing = SYSTEM_ROLES.filter((r) => !existingIds.has(r.id));
        setRoles(missing.length > 0 ? [...loadedRoles, ...missing] : loadedRoles);
      }
      if (loadedUsers.length > 0) {
        setUsers(loadedUsers);
      }

      const session = readJSON<string | null>(SESSION_KEY, null);
      if (session) {
        const exists =
          loadedUsers.find((u) => u.id === session || u.username === session) ||
          users.find((u) => u.id === session || u.username === session);
        if (exists) {
          setCurrentUserId(exists.id);
        } else {
          writeJSON(SESSION_KEY, null);
          setCurrentUserId(null);
        }
      }
      setLoading(false);
    }
    initAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentUser = useMemo(() => {
    if (!currentUserId) return null;
    return users.find((u) => u.id === currentUserId) ?? null;
  }, [currentUserId, users]);

  const currentRole = useMemo(() => {
    if (!currentUser) return null;
    return roles.find((r) => r.id === currentUser.roleId) ?? null;
  }, [currentUser, roles]);

  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isSuperAdmin) return true;
    return currentRole?.id === 'role-admin' || false;
  }, [currentUser, currentRole]);

  const hasPermission = useCallback(
    (perm: PermissionKey): boolean => {
      if (!currentUser) return false;
      if (isAdmin) return true;
      if (!currentRole) return false;
      return currentRole.permissions.includes(perm);
    },
    [currentUser, currentRole, isAdmin],
  );

  // 飞牛账户切换检测：NAS 授权会话与网关身份不一致时自动退出（含账号切换与退出登录）
  useEffect(() => {
    if (!currentUser) return;
    const loginType = readJSON<string | null>(SESSION_LOGIN_TYPE_KEY, null);
    if (loginType !== 'nas') return;

    let stopped = false;
    const checkGatewayIdentity = async () => {
      try {
        const nas = await getNasUser();
        if (stopped) return;
        if (!nas.available || !nas.username || nas.username !== currentUser.username) {
          writeJSON(SESSION_KEY, null);
          writeJSON(SESSION_LOGIN_TYPE_KEY, null);
          setCurrentUserId(null);
          toast.info('检测到飞牛账号已切换或退出，已自动退出 IP台账管理');
        }
      } catch {
        // 网络异常时忽略，等待下次检测
      }
    };

    const interval = window.setInterval(checkGatewayIdentity, 15000);
    const onActive = () => {
      if (document.visibilityState === 'visible') checkGatewayIdentity();
    };
    document.addEventListener('visibilitychange', onActive);
    window.addEventListener('focus', onActive);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onActive);
      window.removeEventListener('focus', onActive);
    };
  }, [currentUser]);

  const login = async (u: string, p: string) => {
    const res = await loginWithPasswordApi(u, p);
    if (!res.ok || !res.user) {
      return { ok: false, error: res.error || '用户名或密码错误' };
    }
    const loggedUser = res.user;
    setUsers((prev) => {
      const idx = prev.findIndex((x) => x.id === loggedUser.id || x.username === loggedUser.username);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], lastLoginAt: nowISO() };
        return next;
      }
      return [...prev, loggedUser];
    });
    writeJSON(SESSION_KEY, loggedUser.id);
    writeJSON(SESSION_LOGIN_TYPE_KEY, 'password');
    setCurrentUserId(loggedUser.id);
    return { ok: true };
  };

  const loginWithNas = async () => {
    const res = await loginWithNasApi();
    if (!res.ok || !res.user) {
      return { ok: false, error: res.error || '飞牛 NAS 授权登录失败' };
    }
    const loggedUser = res.user;
    setUsers((prev) => {
      const idx = prev.findIndex((x) => x.id === loggedUser.id || x.username === loggedUser.username);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], lastLoginAt: nowISO() };
        return next;
      }
      return [...prev, loggedUser];
    });
    writeJSON(SESSION_KEY, loggedUser.id);
    writeJSON(SESSION_LOGIN_TYPE_KEY, 'nas');
    setCurrentUserId(loggedUser.id);
    return { ok: true };
  };

  const logout = () => {
    writeJSON(SESSION_KEY, null);
    writeJSON(SESSION_LOGIN_TYPE_KEY, null);
    setCurrentUserId(null);
  };

  // ---- 用户 CRUD ----
  const addUser: AuthContextType['addUser'] = (data) => {
    const name = data.username.trim();
    if (name.length < 2) return { ok: false, error: '用户名至少 2 个字符' };
    if (data.password.length < 4) return { ok: false, error: '密码至少 4 个字符' };
    if (users.some((x) => x.username.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: '用户名已存在' };
    }
    const newUser: User = {
      id: genId(),
      username: name,
      realName: data.realName.trim() || name,
      password: data.password,
      roleId: data.roleId || 'role-operator',
      status: 'active',
      createdAt: nowISO(),
    };
    setUsers((prev) => [...prev, newUser]);
    return { ok: true };
  };

  const updateUser: AuthContextType['updateUser'] = (id, data) => {
    if (data.username) {
      const name = data.username.trim();
      if (users.some((x) => x.id !== id && x.username.toLowerCase() === name.toLowerCase())) {
        return { ok: false, error: '该用户名已被占用' };
      }
    }
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        return {
          ...u,
          ...data,
          username: data.username ? data.username.trim() : u.username,
          realName: data.realName !== undefined ? data.realName.trim() : u.realName,
        };
      }),
    );
    return { ok: true };
  };

  const deleteUser: AuthContextType['deleteUser'] = (id) => {
    const target = users.find((u) => u.id === id);
    if (!target) return { ok: false, error: '用户不存在' };
    if (target.id === currentUserId) return { ok: false, error: '无法删除当前正在登录的账号' };
    if (target.isSuperAdmin) return { ok: false, error: '超级管理员账号不可删除' };
    setUsers((prev) => prev.filter((u) => u.id !== id));
    return { ok: true };
  };

  const resetUserPassword: AuthContextType['resetUserPassword'] = (id, newPassword) => {
    const pwd = newPassword || '123456';
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, password: pwd } : u)),
    );
    return { ok: true, password: pwd };
  };

  const toggleUserStatus: AuthContextType['toggleUserStatus'] = (id) => {
    const target = users.find((u) => u.id === id);
    if (!target) return { ok: false, error: '用户不存在' };
    if (target.id === currentUserId) return { ok: false, error: '无法禁用当前正在登录的账号' };
    if (target.isSuperAdmin) return { ok: false, error: '超级管理员账号不可禁用' };

    const nextStatus = target.status === 'active' ? 'disabled' : 'active';
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: nextStatus } : u)),
    );
    return { ok: true };
  };

  // ---- 角色 CRUD ----
  const addRole: AuthContextType['addRole'] = (data) => {
    const name = data.name.trim();
    if (!name) return { ok: false, error: '请输入角色名称' };
    if (roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: '角色名称已存在' };
    }
    const newRole: Role = {
      id: `role-${genId()}`,
      name,
      description: data.description.trim(),
      permissions: data.permissions,
      createdAt: nowISO(),
    };
    setRoles((prev) => [...prev, newRole]);
    return { ok: true };
  };

  const updateRole: AuthContextType['updateRole'] = (id, data) => {
    const target = roles.find((r) => r.id === id);
    if (!target) return { ok: false, error: '角色不存在' };
    if (data.name) {
      const name = data.name.trim();
      if (roles.some((r) => r.id !== id && r.name.toLowerCase() === name.toLowerCase())) {
        return { ok: false, error: '角色名称已存在' };
      }
    }
    setRoles((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          name: data.name !== undefined ? data.name.trim() : r.name,
          description: data.description !== undefined ? data.description.trim() : r.description,
          permissions: data.permissions !== undefined ? data.permissions : r.permissions,
        };
      }),
    );
    return { ok: true };
  };

  const deleteRole: AuthContextType['deleteRole'] = (id) => {
    const target = roles.find((r) => r.id === id);
    if (!target) return { ok: false, error: '角色不存在' };
    if (target.isSystem || target.id === 'role-admin') {
      return { ok: false, error: '系统预置角色不可删除' };
    }
    const hasAssignedUsers = users.some((u) => u.roleId === id);
    if (hasAssignedUsers) {
      return { ok: false, error: '该角色下已有用户，请先转移或重新分配用户角色后再删除' };
    }
    setRoles((prev) => prev.filter((r) => r.id !== id));
    return { ok: true };
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRole,
        username: currentUser?.username ?? null,
        isAuthenticated: !!currentUser,
        loading,
        hasUsers: users.length > 0,
        isAdmin,
        nasInfo,
        hasPermission,
        login,
        loginWithNas,
        logout,
        users,
        addUser,
        updateUser,
        deleteUser,
        resetUserPassword,
        toggleUserStatus,
        roles,
        addRole,
        updateRole,
        deleteRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
