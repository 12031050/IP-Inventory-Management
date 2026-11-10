import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { readJSON, writeJSON, genId, nowISO } from '@/lib/storage';
import { parseCIDR, utilizationPercent, findFirstFreeIP, isValidIPv4 } from '@/lib/ip-utils';
import { loadAppDataApi, saveAppDataApi } from '@/lib/api';
import type {
  AppData,
  IPRecord,
  Subnet,
  Vlan,
  AddressPool,
  Device,
  BackupRecord,
  IPStatus,
} from '@/types';

const DATA_KEY = 'app_data';

const emptyData: AppData = {
  ips: [],
  subnets: [],
  vlans: [],
  pools: [],
  devices: [],
  backups: [],
};

interface ConflictInfo {
  conflict: boolean;
  existing?: IPRecord;
}

interface DataContextType {
  data: AppData;
  isLoading?: boolean;
  // IP 台账
  addIP: (rec: Omit<IPRecord, 'id' | 'createdAt' | 'updatedAt'>) => ConflictInfo;
  updateIP: (id: string, rec: Partial<IPRecord>) => ConflictInfo;
  deleteIP: (id: string) => void;
  deleteIPs: (ids: string[]) => void;
  forceAddIP: (rec: Omit<IPRecord, 'id' | 'createdAt' | 'updatedAt'>, status: IPStatus) => void;
  // 路由器/交换机地址表导入（支持覆盖/跳过/合并冲突处理）
  importIPRecord: (
    rec: Omit<IPRecord, 'id' | 'createdAt' | 'updatedAt'>,
    strategy: 'overwrite' | 'skip' | 'merge',
  ) => { added: number; overwritten: number; merged: number; skipped: number };
  // 子网
  addSubnet: (rec: Omit<Subnet, 'id' | 'createdAt'>) => void;
  updateSubnet: (id: string, rec: Partial<Subnet>) => void;
  deleteSubnet: (id: string) => { ok: boolean; reason?: string };
  // VLAN
  addVlan: (rec: Omit<Vlan, 'id' | 'createdAt'>) => void;
  updateVlan: (id: string, rec: Partial<Vlan>) => void;
  deleteVlan: (id: string) => { ok: boolean; reason?: string };
  // 地址池
  addPool: (rec: Omit<AddressPool, 'id' | 'createdAt'>) => void;
  updatePool: (id: string, rec: Partial<AddressPool>) => void;
  deletePool: (id: string) => void;
  allocateFromPool: (poolId: string) => { ok: boolean; ip?: string; reason?: string };
  // 设备
  addDevice: (rec: Omit<Device, 'id' | 'createdAt'>) => void;
  updateDevice: (id: string, rec: Partial<Device>) => void;
  deleteDevice: (id: string) => void;
  // 备份
  createBackup: () => BackupRecord;
  restoreBackup: (backupId: string) => boolean;
  restoreFromFile: (raw: string) => { ok: boolean; reason?: string };
  deleteBackup: (backupId: string) => void;
  // 统计
  subnetStats: (subnetId: string) => { allocated: number; usable: number; percent: number };
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => {
    return readJSON<AppData>(DATA_KEY, emptyData);
  });
  const [isLoading, setIsLoading] = useState(true);

  // 初始化从后端 SQLite 加载最新数据
  useEffect(() => {
    async function initData() {
      try {
        const sqliteData = await loadAppDataApi();
        if (sqliteData) {
          setData(sqliteData);
        }
      } finally {
        setIsLoading(false);
      }
    }
    initData();
  }, []);

  // 数据发生改变时同步保存到 SQLite 与 localStorage
  useEffect(() => {
    if (!isLoading) {
      saveAppDataApi(data);
    }
  }, [data, isLoading]);

  // ---- IP 台账 ----
  const checkConflict = useCallback(
    (ip: string, excludeId?: string): IPRecord | undefined => {
      const clean = ip.trim();
      return data.ips.find((r) => r.ip === clean && r.id !== excludeId);
    },
    [data.ips],
  );

  const addIP: DataContextType['addIP'] = useCallback(
    (rec) => {
      const existing = checkConflict(rec.ip);
      if (existing) {
        return { conflict: true, existing };
      }
      const now = nowISO();
      const record: IPRecord = {
        ...rec,
        id: genId(),
        createdAt: now,
        updatedAt: now,
      };
      setData((d) => ({ ...d, ips: [record, ...d.ips] }));
      return { conflict: false };
    },
    [checkConflict],
  );

  const forceAddIP: DataContextType['forceAddIP'] = useCallback((rec, status) => {
    const now = nowISO();
    const record: IPRecord = {
      ...rec,
      status,
      id: genId(),
      createdAt: now,
      updatedAt: now,
    };
    setData((d) => ({ ...d, ips: [record, ...d.ips] }));
  }, []);

  const updateIP: DataContextType['updateIP'] = useCallback(
    (id, rec) => {
      if (rec.ip) {
        const existing = checkConflict(rec.ip, id);
        if (existing) {
          return { conflict: true, existing };
        }
      }
      const now = nowISO();
      setData((d) => ({
        ...d,
        ips: d.ips.map((item) => (item.id === id ? { ...item, ...rec, updatedAt: now } : item)),
      }));
      return { conflict: false };
    },
    [checkConflict],
  );

  const deleteIP: DataContextType['deleteIP'] = useCallback((id) => {
    setData((d) => ({ ...d, ips: d.ips.filter((item) => item.id !== id) }));
  }, []);

  const deleteIPs: DataContextType['deleteIPs'] = useCallback((ids) => {
    const set = new Set(ids);
    setData((d) => ({ ...d, ips: d.ips.filter((item) => !set.has(item.id)) }));
  }, []);

  const importIPRecord: DataContextType['importIPRecord'] = useCallback(
    (rec, strategy) => {
      const existing = data.ips.find((r) => r.ip === rec.ip.trim());
      const now = nowISO();
      if (!existing) {
        const newRec: IPRecord = { ...rec, id: genId(), createdAt: now, updatedAt: now };
        setData((d) => ({ ...d, ips: [newRec, ...d.ips] }));
        return { added: 1, overwritten: 0, merged: 0, skipped: 0 };
      }

      if (strategy === 'skip') {
        return { added: 0, overwritten: 0, merged: 0, skipped: 1 };
      }

      if (strategy === 'overwrite') {
        setData((d) => ({
          ...d,
          ips: d.ips.map((r) =>
            r.id === existing.id
              ? { ...r, ...rec, updatedAt: now }
              : r,
          ),
        }));
        return { added: 0, overwritten: 1, merged: 0, skipped: 0 };
      }

      // merge: 仅用新记录中非空字段填充旧记录空白字段
      setData((d) => ({
        ...d,
        ips: d.ips.map((r) => {
          if (r.id !== existing.id) return r;
          return {
            ...r,
            hostname: r.hostname || rec.hostname,
            mac: r.mac || rec.mac,
            purpose: r.purpose || rec.purpose,
            subnetId: r.subnetId || rec.subnetId,
            note: r.note || rec.note,
            updatedAt: now,
          };
        }),
      }));
      return { added: 0, overwritten: 0, merged: 1, skipped: 0 };
    },
    [data.ips],
  );

  // ---- 子网 ----
  const addSubnet: DataContextType['addSubnet'] = useCallback((rec) => {
    const record: Subnet = { ...rec, id: genId(), createdAt: nowISO() };
    setData((d) => ({ ...d, subnets: [record, ...d.subnets] }));
  }, []);

  const updateSubnet: DataContextType['updateSubnet'] = useCallback((id, rec) => {
    setData((d) => ({ ...d, subnets: d.subnets.map((s) => (s.id === id ? { ...s, ...rec } : s)) }));
  }, []);

  const deleteSubnet: DataContextType['deleteSubnet'] = useCallback(
    (id) => {
      const hasIps = data.ips.some((r) => r.subnetId === id);
      if (hasIps) {
        return { ok: false, reason: '该子网下存在已关联的 IP 记录，请先处理关联 IP' };
      }
      setData((d) => ({ ...d, subnets: d.subnets.filter((s) => s.id !== id) }));
      return { ok: true };
    },
    [data.ips],
  );

  // ---- VLAN ----
  const addVlan: DataContextType['addVlan'] = useCallback((rec) => {
    const record: Vlan = { ...rec, id: genId(), createdAt: nowISO() };
    setData((d) => ({ ...d, vlans: [record, ...d.vlans] }));
  }, []);

  const updateVlan: DataContextType['updateVlan'] = useCallback((id, rec) => {
    setData((d) => ({ ...d, vlans: d.vlans.map((v) => (v.id === id ? { ...v, ...rec } : v)) }));
  }, []);

  const deleteVlan: DataContextType['deleteVlan'] = useCallback(
    (id) => {
      const vlan = data.vlans.find((v) => v.id === id);
      if (vlan && vlan.subnetIds && vlan.subnetIds.length > 0) {
        return { ok: false, reason: '该 VLAN 已关联子网，请先解除关联' };
      }
      setData((d) => ({ ...d, vlans: d.vlans.filter((v) => v.id !== id) }));
      return { ok: true };
    },
    [data.vlans],
  );

  // ---- 地址池 ----
  const addPool: DataContextType['addPool'] = useCallback((rec) => {
    const record: AddressPool = { ...rec, id: genId(), createdAt: nowISO() };
    setData((d) => ({ ...d, pools: [record, ...d.pools] }));
  }, []);

  const updatePool: DataContextType['updatePool'] = useCallback((id, rec) => {
    setData((d) => ({ ...d, pools: d.pools.map((p) => (p.id === id ? { ...p, ...rec } : p)) }));
  }, []);

  const deletePool: DataContextType['deletePool'] = useCallback((id) => {
    setData((d) => ({ ...d, pools: d.pools.filter((p) => p.id !== id) }));
  }, []);

  const allocateFromPool: DataContextType['allocateFromPool'] = useCallback(
    (poolId) => {
      const pool = data.pools.find((p) => p.id === poolId);
      if (!pool) return { ok: false, reason: '地址池不存在' };
      if (!isValidIPv4(pool.startIp) || !isValidIPv4(pool.endIp)) {
        return { ok: false, reason: '地址池 IP 范围无效' };
      }
      const used = data.ips.filter((r) => r.status !== 'unallocated').map((r) => r.ip);
      const free = findFirstFreeIP(pool.startIp, pool.endIp, used);
      if (!free) return { ok: false, reason: '地址池内已无可用 IP，地址池已满' };
      const now = nowISO();
      const record: IPRecord = {
        id: genId(),
        ip: free,
        hostname: '',
        mac: '',
        purpose: pool.purpose || '地址池分配',
        subnetId: pool.subnetId,
        status: 'allocated',
        note: `来自地址池「${pool.name}」`,
        createdAt: now,
        updatedAt: now,
      };
      setData((d) => ({ ...d, ips: [record, ...d.ips] }));
      return { ok: true, ip: free };
    },
    [data.pools, data.ips],
  );

  // ---- 设备 ----
  const addDevice: DataContextType['addDevice'] = useCallback((rec) => {
    const record: Device = { ...rec, id: genId(), createdAt: nowISO() };
    setData((d) => ({ ...d, devices: [record, ...d.devices] }));
  }, []);

  const updateDevice: DataContextType['updateDevice'] = useCallback((id, rec) => {
    setData((d) => ({ ...d, devices: d.devices.map((dv) => (dv.id === id ? { ...dv, ...rec } : dv)) }));
  }, []);

  const deleteDevice: DataContextType['deleteDevice'] = useCallback((id) => {
    setData((d) => ({ ...d, devices: d.devices.filter((dv) => dv.id !== id) }));
  }, []);

  // ---- 备份 ----
  const createBackup: DataContextType['createBackup'] = useCallback(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const payload = {
      ips: data.ips,
      subnets: data.subnets,
      vlans: data.vlans,
      pools: data.pools,
      devices: data.devices,
      exportedAt: now.toISOString(),
    };
    const dataStr = JSON.stringify(payload);
    const record: BackupRecord = {
      id: genId(),
      filename: `IPAM_备份_${stamp}.json`,
      timestamp: now.toISOString(),
      size: dataStr.length,
      data: dataStr,
    };
    setData((d) => ({ ...d, backups: [record, ...d.backups] }));
    return record;
  }, [data]);

  const restoreBackup: DataContextType['restoreBackup'] = useCallback((backupId) => {
    const backup = data.backups.find((b) => b.id === backupId);
    if (!backup) return false;
    try {
      const payload = JSON.parse(backup.data);
      setData((d) => ({
        ...d,
        ips: payload.ips ?? [],
        subnets: payload.subnets ?? [],
        vlans: payload.vlans ?? [],
        pools: payload.pools ?? [],
        devices: payload.devices ?? [],
      }));
      return true;
    } catch {
      toast.error('备份文件损坏或格式错误，无法恢复');
      return false;
    }
  }, [data.backups]);

  const restoreFromFile: DataContextType['restoreFromFile'] = useCallback((raw) => {
    try {
      const payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object') {
        return { ok: false, reason: '备份文件格式无效' };
      }
      setData((d) => ({
        ...d,
        ips: Array.isArray(payload.ips) ? payload.ips : [],
        subnets: Array.isArray(payload.subnets) ? payload.subnets : [],
        vlans: Array.isArray(payload.vlans) ? payload.vlans : [],
        pools: Array.isArray(payload.pools) ? payload.pools : [],
        devices: Array.isArray(payload.devices) ? payload.devices : [],
      }));
      return { ok: true };
    } catch {
      return { ok: false, reason: '备份文件损坏或格式错误，无法恢复' };
    }
  }, []);

  const deleteBackup: DataContextType['deleteBackup'] = useCallback((backupId) => {
    setData((d) => ({ ...d, backups: d.backups.filter((b) => b.id !== backupId) }));
  }, []);

  // ---- 统计 ----
  const subnetStats: DataContextType['subnetStats'] = useCallback(
    (subnetId) => {
      const subnet = data.subnets.find((s) => s.id === subnetId);
      const info = subnet ? parseCIDR(subnet.cidr) : null;
      const usable = info ? info.usable : 0;
      const allocated = data.ips.filter((r) => r.subnetId === subnetId && r.status !== 'unallocated').length;
      return { allocated, usable, percent: utilizationPercent(allocated, usable) };
    },
    [data.subnets, data.ips],
  );

  const value = useMemo<DataContextType>(
    () => ({
      data,
      isLoading,
      addIP,
      updateIP,
      deleteIP,
      deleteIPs,
      forceAddIP,
      importIPRecord,
      addSubnet,
      updateSubnet,
      deleteSubnet,
      addVlan,
      updateVlan,
      deleteVlan,
      addPool,
      updatePool,
      deletePool,
      allocateFromPool,
      addDevice,
      updateDevice,
      deleteDevice,
      createBackup,
      restoreBackup,
      restoreFromFile,
      deleteBackup,
      subnetStats,
    }),
    [
      data,
      isLoading,
      addIP,
      updateIP,
      deleteIP,
      deleteIPs,
      forceAddIP,
      importIPRecord,
      addSubnet,
      updateSubnet,
      deleteSubnet,
      addVlan,
      updateVlan,
      deleteVlan,
      addPool,
      updatePool,
      deletePool,
      allocateFromPool,
      addDevice,
      updateDevice,
      deleteDevice,
      createBackup,
      restoreBackup,
      restoreFromFile,
      deleteBackup,
      subnetStats,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
