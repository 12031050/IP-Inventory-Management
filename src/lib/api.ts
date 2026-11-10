/**
 * IPAM 系统 SQLite / 本地持久化统一 API 层
 * 既支持直连 Python SQLite 后端（保存在 NAS /var/apps/ipam/var/ipam.db 下），
 * 又支持离线/前端静态预览下的 localStorage 自动同步回退。
 */
import { readJSON, writeJSON, nowISO } from '@/lib/storage';
import type {
  AppData,
  IPRecord,
  Subnet,
  Vlan,
  AddressPool,
  Device,
  BackupRecord,
  User,
  Role,
} from '@/types';

const API_BASE = ((): string => {
  if (typeof window === 'undefined') return '';
  const { pathname } = window.location;
  // 统一网关入口：/app/ipam 前缀下，API 请求需带同样前缀
  const m = pathname.match(/^(\/app\/[^/]+)/);
  if (m) return m[1];
  return '';
})();

// 飞牛统一网关固定前缀（app/ui/config 的 gatewayPrefix）。
// 当页面运行在 iframe 中、pathname 未落在 /app/... 下时，API_BASE 会退化为 ''，
// 导致登录请求打到站点根路径被网关静态层以「非 JSON 404」拦截（表现为「授权登录失败」/登录 404）。
const GATEWAY_FALLBACK = '/app/ipam';

// 统一的 API 请求封装：按「检测到的前缀 → 已知网关前缀」的顺序尝试，
// 任一候选返回 404（路由未命中）时自动改用另一前缀重试，
// 从而兼容「网关剥离前缀」与「网关保留前缀」两种转发约定，彻底消除登录 404/400。
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const candidates: string[] = [];
  for (const base of [API_BASE, GATEWAY_FALLBACK]) {
    const full = `${base}${path}`;
    if (!candidates.includes(full)) candidates.push(full);
  }
  let lastRes: Response | null = null;
  for (let i = 0; i < candidates.length; i++) {
    let res: Response;
    try {
      res = await fetch(candidates[i], init);
    } catch {
      continue; // 网络异常：尝试下一候选
    }
    lastRes = res;
    // 404 表示该前缀下路由未命中（被静态/网关层拦截），换下一前缀重试
    if (res.status !== 404) return res;
    if (i === candidates.length - 1) return res;
  }
  // 所有候选均网络异常：抛出，交由调用方降级处理
  if (!lastRes) throw new Error('apiFetch: all candidates failed');
  return lastRes;
}

// 检测后端 SQLite API 是否可用
let isBackendAvailable: boolean | null = null;

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await apiFetch('/api/health', { method: 'GET', cache: 'no-cache' });
    isBackendAvailable = res.ok;
    return res.ok;
  } catch {
    isBackendAvailable = false;
    return false;
  }
}

export interface NasUserInfo {
  available: boolean;
  username?: string;
  uid?: string;
  isAdmin?: boolean;
  hostname?: string;
}

// 获取当前 NAS 环境中注入的用户信息与设备名（无网关身份时 available:false，不伪造默认账户）
export async function getNasUser(): Promise<NasUserInfo> {
  try {
    const res = await apiFetch('/api/nas/user', { method: 'GET', credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {
    // 忽略错误
  }
  return { available: false };
}

// 飞牛 NAS 免密授权登录（身份完全由网关注入的 X-Trim-* Header 决定，前端不携带任何自报用户名）
export async function loginWithNasApi(): Promise<{ ok: boolean; user?: User; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/nas-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, user: data.user };
    }
    const errData = await res.json().catch(() => ({}));
    return { ok: false, error: errData.error || '飞牛 NAS 授权登录失败' };
  } catch {
    // 后端无响应
  }
  return { ok: false, error: '后端服务不可用，无法进行飞牛 NAS 授权登录' };
}

// 本地密码登录
export async function loginWithPasswordApi(
  username: string,
  password: string,
): Promise<{ ok: boolean; user?: User; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, user: data.user };
    }
    const errData = await res.json().catch(() => ({}));
    return { ok: false, error: errData.error || '用户名或密码错误' };
  } catch {
    // 后端不可用：本地降级（离线调试场景）
    const users = readJSON<User[]>('app_users_v2', []);
    const user = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!user) return { ok: false, error: '后端服务不可用' };
    if (user.status === 'disabled') return { ok: false, error: '该账号已被禁用' };
    if (user.password && user.password !== password) return { ok: false, error: '用户名或密码错误' };
    return { ok: true, user };
  }
}

// 完整数据加载（从 SQLite 或 localStorage）
export async function loadAppDataApi(): Promise<AppData> {
  try {
    const res = await apiFetch('/api/data', { method: 'GET', credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        writeJSON('app_data', data); // 缓存到本地
        return data;
      }
    }
  } catch {
    // 降级使用本地存储
  }
  return readJSON<AppData>('app_data', {
    ips: [],
    subnets: [],
    vlans: [],
    pools: [],
    devices: [],
    backups: [],
  });
}

// 完整数据保存（写入 SQLite 与 localStorage 镜像）
export async function saveAppDataApi(data: AppData): Promise<boolean> {
  writeJSON('app_data', data);
  try {
    const res = await apiFetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 获取全部用户（从 SQLite，回退 localStorage）
export async function getUsersApi(): Promise<User[]> {
  try {
    const res = await apiFetch('/api/users', { method: 'GET', credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        writeJSON('app_users_v2', data);
        return data;
      }
    }
  } catch {
    // 降级
  }
  return readJSON<User[]>('app_users_v2', []);
}

// 保存全部用户（写入 SQLite 与 localStorage 镜像）
export async function saveUsersApi(users: User[]): Promise<boolean> {
  writeJSON('app_users_v2', users);
  try {
    const res = await apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(users),
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 获取全部角色（从 SQLite，回退 localStorage）
export async function getRolesApi(): Promise<Role[]> {
  try {
    const res = await apiFetch('/api/roles', { method: 'GET', credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        writeJSON('app_roles_v2', data);
        return data;
      }
    }
  } catch {
    // 降级
  }
  return readJSON<Role[]>('app_roles_v2', []);
}

// 保存全部角色（写入 SQLite 与 localStorage 镜像）
export async function saveRolesApi(roles: Role[]): Promise<boolean> {
  writeJSON('app_roles_v2', roles);
  try {
    const res = await apiFetch('/api/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roles),
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}
