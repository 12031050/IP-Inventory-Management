import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Upload, FileSpreadsheet, FileText, Router } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { exportToCSV, exportToExcel, parseFile } from '@/lib/import-export';
import { IP_STATUS_LABELS, type IPStatus } from '@/types';
import PageHeader from '@/components/common/PageHeader';
import RouterImportDialog from '@/components/import/RouterImportDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const STATUS_REVERSE: Record<string, IPStatus> = Object.entries(IP_STATUS_LABELS).reduce(
  (acc, [k, v]) => {
    acc[v] = k as IPStatus;
    return acc;
  },
  {} as Record<string, IPStatus>,
);

type DataType = 'ips' | 'subnets' | 'vlans' | 'devices';

const config: Record<
  DataType,
  { label: string; headers: string[]; count: number; desc: string }
> = {
  ips: { label: 'IP台账', headers: ['IP地址', '主机名', 'MAC地址', '用途', '所属子网', '状态', '备注'], count: 0, desc: '导出/导入 IP 地址记录' },
  subnets: { label: '子网规划', headers: ['子网CIDR', '名称', '网关', '版本', '备注'], count: 0, desc: '导出/导入子网规划数据' },
  vlans: { label: 'VLAN', headers: ['VLAN ID', '名称', '网关', '关联子网', '备注'], count: 0, desc: '导出/导入 VLAN 配置' },
  devices: { label: '设备资产', headers: ['设备名称', '类型', '位置', 'IP地址', 'MAC地址', '备注'], count: 0, desc: '导出/导入设备资产' },
};

export default function ImportExportPage() {
  const { data, addIP, addSubnet, addVlan, addDevice } = useData();
  const { hasPermission } = useAuth();
  const canImport = hasPermission('io:import');
  const canExport = hasPermission('io:export');

  const fileRef = useRef<HTMLInputElement>(null);
  const [activeType, setActiveType] = useState<DataType | null>(null);
  const [routerOpen, setRouterOpen] = useState(false);

  const counts: Record<DataType, number> = {
    ips: data.ips.length,
    subnets: data.subnets.length,
    vlans: data.vlans.length,
    devices: data.devices.length,
  };

  const buildRows = (type: DataType): (string | number)[][] => {
    if (type === 'ips') {
      return data.ips.map((r) => {
        const subnet = data.subnets.find((s) => s.id === r.subnetId);
        return [r.ip, r.hostname, r.mac, r.purpose, subnet ? subnet.cidr : '', IP_STATUS_LABELS[r.status], r.note];
      });
    }
    if (type === 'subnets') {
      return data.subnets.map((s) => [s.cidr, s.name, s.gateway, s.version, s.note]);
    }
    if (type === 'vlans') {
      return data.vlans.map((v) => {
        const cidrs = v.subnetIds.map((sid) => data.subnets.find((s) => s.id === sid)?.cidr).filter(Boolean);
        return [v.vlanId, v.name, v.gateway, cidrs.join(','), v.note];
      });
    }
    return data.devices.map((d) => [d.name, d.type, d.location, d.ip, d.mac, d.note]);
  };

  const handleExport = (type: DataType, fmt: 'csv' | 'xlsx') => {
    const rows = buildRows(type);
    if (rows.length === 0) {
      toast.error(`${config[type].label}暂无数据可导出`);
      return;
    }
    const filename = `IPAM_${config[type].label}_${new Date().toISOString().slice(0, 10)}`;
    if (fmt === 'csv') exportToCSV(filename, config[type].headers, rows);
    else exportToExcel(filename, config[type].headers, rows);
    toast.success(`已导出 ${rows.length} 条${config[type].label}数据`);
  };

  const handleImportClick = (type: DataType) => {
    setActiveType(type);
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeType) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      toast.error('仅支持 CSV 或 Excel（.xlsx/.xls）格式');
      e.target.value = '';
      return;
    }
    const { rows, errors } = await parseFile(file);
    if (errors.length > 0) {
      toast.error(errors[0]);
      e.target.value = '';
      return;
    }
    if (rows.length === 0) {
      toast.error('文件中没有可导入的数据');
      e.target.value = '';
      return;
    }

    const type = activeType;
    let added = 0;
    let skipped = 0;
    const errLines: number[] = [];

    rows.forEach((row, idx) => {
      try {
        if (type === 'ips') {
          const ip = (row['IP地址'] || row['ip'] || '').trim();
          if (!ip) {
            errLines.push(idx + 2);
            return;
          }
          const status = STATUS_REVERSE[(row['状态'] || '').trim()] ?? 'allocated';
          const subnetCidr = (row['所属子网'] || '').trim();
          const subnet = subnetCidr ? data.subnets.find((s) => s.cidr === subnetCidr) : undefined;
          const res = addIP({
            ip,
            hostname: (row['主机名'] || '').trim(),
            mac: (row['MAC地址'] || '').trim(),
            purpose: (row['用途'] || '').trim(),
            subnetId: subnet ? subnet.id : null,
            status,
            note: (row['备注'] || '').trim(),
          });
          if (res.conflict) skipped++;
          else added++;
        } else if (type === 'subnets') {
          const cidr = (row['子网CIDR'] || row['CIDR'] || '').trim();
          if (!cidr) {
            errLines.push(idx + 2);
            return;
          }
          addSubnet({
            cidr,
            name: (row['名称'] || '').trim(),
            gateway: (row['网关'] || '').trim(),
            version: cidr.includes(':') ? 'IPv6' : 'IPv4',
            note: (row['备注'] || '').trim(),
          });
          added++;
        } else if (type === 'vlans') {
          const vlanId = Number(row['VLAN ID'] || row['VLANID'] || '0');
          if (!vlanId) {
            errLines.push(idx + 2);
            return;
          }
          const cidrList = (row['关联子网'] || '').split(',').map((c) => c.trim()).filter(Boolean);
          const subnetIds = cidrList
            .map((c) => data.subnets.find((s) => s.cidr === c)?.id)
            .filter((id): id is string => !!id);
          addVlan({
            vlanId,
            name: (row['名称'] || '').trim(),
            gateway: (row['网关'] || '').trim(),
            subnetIds,
            note: (row['备注'] || '').trim(),
          });
          added++;
        } else {
          const name = (row['设备名称'] || row['名称'] || '').trim();
          if (!name) {
            errLines.push(idx + 2);
            return;
          }
          addDevice({
            name,
            type: (row['类型'] || '其他').trim(),
            location: (row['位置'] || '').trim(),
            ip: (row['IP地址'] || '').trim(),
            mac: (row['MAC地址'] || '').trim(),
            note: (row['备注'] || '').trim(),
          });
          added++;
        }
      } catch {
        errLines.push(idx + 2);
      }
    });

    const parts = [`成功导入 ${added} 条`];
    if (skipped > 0) parts.push(`跳过冲突 ${skipped} 条`);
    if (errLines.length > 0) parts.push(`错误行 ${errLines.length} 条（第 ${errLines.slice(0, 5).join('、')} 行）`);
    toast.success(parts.join('，'));
    e.target.value = '';
  };

  const types: DataType[] = ['ips', 'subnets', 'vlans', 'devices'];

  return (
    <div>
      <PageHeader title="数据导入导出" description="支持 CSV / Excel 格式的批量导入导出，冲突数据将自动跳过" />

      {/* 路由器/交换机地址表导入 */}
      {canImport && (
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Router className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground">路由器/交换机地址表导入</p>
                <p className="mt-1 text-xs text-muted-foreground text-pretty">
                  上传路由器或交换机导出的地址表（CSV/Excel），自动识别字段并批量导入 IP 台账，支持覆盖/跳过/合并冲突处理。
                </p>
              </div>
            </div>
            <Button onClick={() => setRouterOpen(true)} className="shrink-0 gap-1.5">
              <Upload className="h-4 w-4" /> 导入地址表
            </Button>
          </CardContent>
        </Card>
      )}

      <RouterImportDialog open={routerOpen} onOpenChange={setRouterOpen} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {types.map((type) => (
          <Card key={type}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{config[type].label}</CardTitle>
                <span className="text-sm text-muted-foreground tabular-nums">{counts[type]} 条</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-xs text-muted-foreground">{config[type].desc}</p>
              <div className="flex flex-wrap gap-2">
                {canExport && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleExport(type, 'csv')}>
                      <FileText className="mr-1 h-3.5 w-3.5" /> 导出 CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExport(type, 'xlsx')}>
                      <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> 导出 Excel
                    </Button>
                  </>
                )}
                {canImport && (
                  <Button size="sm" onClick={() => handleImportClick(type)}>
                    <Upload className="mr-1 h-3.5 w-3.5" /> 导入
                  </Button>
                )}
                {!canExport && !canImport && (
                  <span className="text-xs text-muted-foreground py-1">暂无导入/导出操作权限</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardContent className="flex items-start gap-3 p-5">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-sm text-muted-foreground">
            <p className="text-foreground">导入说明</p>
            <p className="mt-1 text-pretty">
              导入文件需包含对应的列标题（如「IP地址」「主机名」等）。IP 台账导入时，若 IP 已存在将自动跳过；子网/VLAN 的关联通过 CIDR 匹配。建议先导出一份模板参考列格式。
            </p>
          </div>
        </CardContent>
      </Card>

      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
    </div>
  );
}