export interface Option {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  withCount?: boolean;
}

export type IPStatus = 'allocated' | 'unallocated' | 'reserved' | 'conflict';
export type IPVersion = 'IPv4' | 'IPv6';

export interface IPRecord {
  id: string;
  ip: string;
  hostname: string;
  mac: string;
  purpose: string;
  subnetId: string | null;
  status: IPStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subnet {
  id: string;
  cidr: string;
  name: string;
  gateway: string;
  version: IPVersion;
  note: string;
  createdAt: string;
}

export interface Vlan {
  id: string;
  vlanId: number;
  name: string;
  gateway: string;
  subnetIds: string[];
  note: string;
  createdAt: string;
}

export interface AddressPool {
  id: string;
  name: string;
  startIp: string;
  endIp: string;
  subnetId: string | null;
  purpose: string;
  note: string;
  createdAt: string;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  location: string;
  ip: string;
  mac: string;
  note: string;
  createdAt: string;
}

// ---- 权限与多用户模型 ----
export type PermissionKey =
  | 'ips:view'
  | 'ips:create'
  | 'ips:edit'
  | 'ips:delete'
  | 'subnets:view'
  | 'subnets:create'
  | 'subnets:edit'
  | 'subnets:delete'
  | 'vlans:view'
  | 'vlans:create'
  | 'vlans:edit'
  | 'vlans:delete'
  | 'pools:view'
  | 'pools:create'
  | 'pools:edit'
  | 'pools:delete'
  | 'devices:view'
  | 'devices:create'
  | 'devices:edit'
  | 'devices:delete'
  | 'users:view'
  | 'users:create'
  | 'users:edit'
  | 'users:delete'
  | 'roles:view'
  | 'roles:create'
  | 'roles:edit'
  | 'roles:delete'
  | 'io:import'
  | 'io:export'
  | 'backup:create'
  | 'backup:restore';

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: { key: PermissionKey; label: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'ips',
    label: 'IP 台账管理',
    permissions: [
      { key: 'ips:view', label: '查看' },
      { key: 'ips:create', label: '新增' },
      { key: 'ips:edit', label: '编辑' },
      { key: 'ips:delete', label: '删除' },
    ],
  },
  {
    id: 'subnets',
    label: '子网规划管理',
    permissions: [
      { key: 'subnets:view', label: '查看' },
      { key: 'subnets:create', label: '新增' },
      { key: 'subnets:edit', label: '编辑' },
      { key: 'subnets:delete', label: '删除' },
    ],
  },
  {
    id: 'vlans',
    label: 'VLAN 管理',
    permissions: [
      { key: 'vlans:view', label: '查看' },
      { key: 'vlans:create', label: '新增' },
      { key: 'vlans:edit', label: '编辑' },
      { key: 'vlans:delete', label: '删除' },
    ],
  },
  {
    id: 'pools',
    label: '地址池管理',
    permissions: [
      { key: 'pools:view', label: '查看' },
      { key: 'pools:create', label: '新增' },
      { key: 'pools:edit', label: '编辑' },
      { key: 'pools:delete', label: '删除' },
    ],
  },
  {
    id: 'devices',
    label: '设备资产管理',
    permissions: [
      { key: 'devices:view', label: '查看' },
      { key: 'devices:create', label: '新增' },
      { key: 'devices:edit', label: '编辑' },
      { key: 'devices:delete', label: '删除' },
    ],
  },
  {
    id: 'users',
    label: '用户管理',
    permissions: [
      { key: 'users:view', label: '查看' },
      { key: 'users:create', label: '新增' },
      { key: 'users:edit', label: '编辑' },
      { key: 'users:delete', label: '删除' },
    ],
  },
  {
    id: 'roles',
    label: '角色管理',
    permissions: [
      { key: 'roles:view', label: '查看' },
      { key: 'roles:create', label: '新增' },
      { key: 'roles:edit', label: '编辑' },
      { key: 'roles:delete', label: '删除' },
    ],
  },
  {
    id: 'io',
    label: '数据导入导出',
    permissions: [
      { key: 'io:import', label: '数据导入' },
      { key: 'io:export', label: '数据导出' },
    ],
  },
  {
    id: 'backup',
    label: '数据备份恢复',
    permissions: [
      { key: 'backup:create', label: '数据备份' },
      { key: 'backup:restore', label: '数据恢复' },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem?: boolean;
  permissions: PermissionKey[];
  createdAt: string;
}

export type UserStatus = 'active' | 'disabled';

export interface User {
  id: string;
  username: string;
  realName: string;
  password?: string;
  roleId: string;
  status: UserStatus;
  isSuperAdmin?: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface BackupRecord {
  id: string;
  filename: string;
  timestamp: string;
  size: number;
  data: string;
}

export interface AppData {
  ips: IPRecord[];
  subnets: Subnet[];
  vlans: Vlan[];
  pools: AddressPool[];
  devices: Device[];
  backups: BackupRecord[];
}

export const IP_STATUS_LABELS: Record<IPStatus, string> = {
  allocated: '已分配',
  unallocated: '未分配',
  reserved: '保留',
  conflict: '冲突',
};

export const DEVICE_TYPES = ['路由器', '交换机', '服务器', 'NAS', '摄像头', '打印机', 'AP', '其他'];
