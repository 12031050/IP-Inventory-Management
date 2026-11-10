import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ShieldCheck, Database, Server, ArrowRight } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { parseCIDR, utilizationPercent, formatNumber } from '@/lib/ip-utils';
import StatusBadge from '@/components/common/StatusBadge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${accent ?? ''}`}>{value}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, subnetStats } = useData();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const ips = data.ips;
    const allocated = ips.filter((r) => r.status === 'allocated').length;
    const conflicts = ips.filter((r) => r.status === 'conflict').length;
    const totalUsable = data.subnets.reduce((sum, s) => {
      const info = parseCIDR(s.cidr);
      return sum + (info ? info.usable : 0);
    }, 0);
    const available = Math.max(0, totalUsable - allocated);
    return { total: ips.length, allocated, available, conflicts, totalUsable };
  }, [data]);

  const subnetRows = useMemo(
    () =>
      data.subnets.map((s) => {
        const st = subnetStats(s.id);
        return { ...s, ...st };
      }),
    [data.subnets, subnetStats],
  );

  const alerts = useMemo(() => {
    const list: { type: 'warn' | 'ok'; title: string; detail: string }[] = [];
    stats.conflicts > 0 &&
      list.push({ type: 'warn', title: 'IP 地址冲突', detail: `${stats.conflicts} 条冲突记录需处理` });
    subnetRows
      .filter((r) => r.percent >= 80)
      .forEach((r) => list.push({ type: 'warn', title: '子网利用率过高', detail: `${r.cidr} · ${r.percent}%` }));
    const lastBackup = data.backups[0];
    if (lastBackup) {
      list.push({ type: 'ok', title: '备份已完成', detail: lastBackup.filename });
    } else {
      list.push({ type: 'warn', title: '尚未备份数据', detail: '建议立即创建数据备份' });
    }
    return list;
  }, [stats, subnetRows, data.backups]);

  const recent = useMemo(
    () => [...data.ips].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [data.ips],
  );

  const moduleCards = [
    { label: 'IP台账', value: formatNumber(stats.total), sub: '地址记录', to: '/ips' },
    { label: '子网规划', value: formatNumber(data.subnets.length), sub: 'CIDR 子网', to: '/subnets' },
    { label: 'VLAN管理', value: formatNumber(data.vlans.length), sub: '虚拟网络', to: '/vlans' },
    { label: '设备资产', value: formatNumber(data.devices.length), sub: '网络设备', to: '/devices' },
  ];

  return (
    <div className="space-y-6">
      <section id="kpis" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="地址总数" value={formatNumber(stats.total)} sub={`跨 ${data.subnets.length} 个子网`} />
        <KpiCard label="已分配" value={formatNumber(stats.allocated)} sub={`利用率 ${utilizationPercent(stats.allocated, stats.totalUsable)}%`} accent="text-primary" />
        <KpiCard label="可用地址" value={formatNumber(stats.available)} sub="待分配" accent="text-success" />
        <KpiCard label="冲突告警" value={formatNumber(stats.conflicts)} sub={stats.conflicts > 0 ? '需立即处理' : '一切正常'} accent={stats.conflicts > 0 ? 'text-destructive' : 'text-success'} />
      </section>

      <section id="charts" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-5 md:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-semibold">子网利用率</h3>
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => navigate('/subnets')}>
              查看全部 <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          {subnetRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无子网，请先在「子网规划」中创建</p>
          ) : (
            <div className="space-y-4">
              {subnetRows.slice(0, 6).map((r) => (
                <div key={r.id}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="tabular-nums">{r.cidr}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {r.allocated} / {r.usable}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${r.percent >= 80 ? 'bg-destructive' : 'bg-primary'}`}
                      style={{ width: `${Math.min(100, r.percent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 font-semibold">告警面板</h3>
          <div className="space-y-3">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                {a.type === 'warn' ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                )}
                <div className="min-w-0">
                  <p className="text-sm">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section id="modules">
        <h3 className="mb-4 font-semibold">功能模块</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {moduleCards.map((m) => (
            <Card
              key={m.label}
              className="cursor-pointer p-4 transition-colors hover:border-primary"
              onClick={() => navigate(m.to)}
            >
              <p className="text-sm font-medium">{m.label}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{m.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{m.sub}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="activity">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">最近分配记录</h3>
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => navigate('/ips')}>
              查看全部 <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Database className="h-8 w-8 opacity-50" />
              <p className="text-sm">暂无 IP 记录</p>
            </div>
          ) : (
            <div className="w-full max-w-full overflow-x-auto bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">IP 地址</th>
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">主机名</th>
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">子网</th>
                    <th className="whitespace-nowrap py-2 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recent.map((r) => {
                    const subnet = data.subnets.find((s) => s.id === r.subnetId);
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap py-3 pr-4 tabular-nums">{r.ip}</td>
                        <td className="whitespace-nowrap py-3 pr-4">{r.hostname || '—'}</td>
                        <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground tabular-nums">
                          {subnet ? subnet.cidr : '—'}
                        </td>
                        <td className="whitespace-nowrap py-3">
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}