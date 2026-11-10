import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { isValidCIDR, parseCIDR, detectVersion, formatNumber } from '@/lib/ip-utils';
import type { Subnet, IPVersion } from '@/types';
import StatusBadge from '@/components/common/StatusBadge';
import PageHeader from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const emptyForm = { cidr: '', name: '', gateway: '', note: '' };

export default function SubnetPage() {
  const { data, addSubnet, updateSubnet, deleteSubnet, subnetStats } = useData();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('subnets:create');
  const canEdit = hasPermission('subnets:edit');
  const canDelete = hasPermission('subnets:delete');

  const [keyword, setKeyword] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subnet | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Subnet | null>(null);
  const [viewTarget, setViewTarget] = useState<Subnet | null>(null);

  const rows = useMemo(
    () => data.subnets.map((s) => ({ ...s, ...subnetStats(s.id) })),
    [data.subnets, subnetStats],
  );

  const subnetIPs = useMemo(
    () => (viewTarget ? data.ips.filter((r) => r.subnetId === viewTarget.id) : []),
    [viewTarget, data.ips],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (s: Subnet) => {
    setEditing(s);
    setForm({ cidr: s.cidr, name: s.name, gateway: s.gateway, note: s.note });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.cidr.trim()) {
      toast.error('请输入子网 CIDR');
      return;
    }
    if (!isValidCIDR(form.cidr.trim())) {
      toast.error('CIDR 格式错误，示例：192.168.1.0/24');
      return;
    }
    const version: IPVersion = detectVersion(form.cidr);
    const payload = {
      cidr: form.cidr.trim(),
      name: form.name.trim(),
      gateway: form.gateway.trim(),
      version,
      note: form.note.trim(),
    };
    if (editing) {
      updateSubnet(editing.id, payload);
      toast.success('子网已更新');
    } else {
      addSubnet(payload);
      toast.success('子网已新增');
    }
    setDialogOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const res = deleteSubnet(deleteTarget.id);
    if (!res.ok) {
      toast.error(res.reason);
    } else {
      toast.success('子网已删除');
    }
    setDeleteTarget(null);
  };

  return (
    <div>
      <PageHeader
        title="子网规划管理"
        description="CIDR 子网划分与 IPv4/IPv6 地址规划，自动计算利用率"
        actions={
          canCreate && (
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> 新增子网
            </Button>
          )
        }
      />

      <Card className="p-4 md:p-5">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">暂无子网，点击「新增子网」开始规划</div>
        ) : (
          <div className="w-full max-w-full overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">子网地址</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">名称</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">网关</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">版本</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">可用 / 已分配</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">利用率</th>
                  <th className="whitespace-nowrap py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap py-3 pr-4 font-medium tabular-nums">{r.cidr}</td>
                    <td className="whitespace-nowrap py-3 pr-4">{r.name || '—'}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground tabular-nums">{r.gateway || '—'}</td>
                    <td className="whitespace-nowrap py-3 pr-4">
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">{r.version}</span>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 tabular-nums">
                      {formatNumber(r.usable)} / {r.allocated}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                          <div
                            className={`h-full rounded-full ${r.percent >= 80 ? 'bg-destructive' : 'bg-primary'}`}
                            style={{ width: `${Math.min(100, r.percent)}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-muted-foreground">{r.percent}%</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setViewTarget(r)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(r)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 新增/编辑 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑子网' : '新增子网'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>子网 CIDR *</Label>
              <Input value={form.cidr} onChange={(e) => setForm({ ...form, cidr: e.target.value })} placeholder="如 192.168.1.0/24" className="font-mono" />
              {form.cidr && isValidCIDR(form.cidr) ? (
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const info = parseCIDR(form.cidr);
                    return info ? `可用地址 ${formatNumber(info.usable)} 个（${info.start} ~ ${info.end}）` : '';
                  })()}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>子网名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 办公网络" />
              </div>
              <div className="space-y-2">
                <Label>网关地址</Label>
                <Input value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })} placeholder="如 192.168.1.1" className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="可选备注信息" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 查看子网内 IP */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>子网 {viewTarget?.cidr} 内 IP 分配详情</DialogTitle>
          </DialogHeader>
          {subnetIPs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">该子网暂无 IP 记录</p>
          ) : (
            <div className="w-full max-w-full overflow-x-auto bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">IP 地址</th>
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">主机名</th>
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">MAC 地址</th>
                    <th className="whitespace-nowrap py-2 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subnetIPs.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap py-3 pr-4 font-medium tabular-nums">{r.ip}</td>
                      <td className="whitespace-nowrap py-3 pr-4">{r.hostname || '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs text-muted-foreground">{r.mac || '—'}</td>
                      <td className="whitespace-nowrap py-3"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除子网</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除子网 <span className="font-mono text-foreground">{deleteTarget?.cidr}</span> 吗？若子网下存在 IP 记录将无法删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}