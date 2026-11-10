import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Vlan } from '@/types';
import PageHeader from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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

const emptyForm = { vlanId: '', name: '', gateway: '', note: '' };

export default function VlanPage() {
  const { data, addVlan, updateVlan, deleteVlan } = useData();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('vlans:create');
  const canEdit = hasPermission('vlans:edit');
  const canDelete = hasPermission('vlans:delete');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vlan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedSubnets, setSelectedSubnets] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Vlan | null>(null);

  const subnetName = useMemo(() => {
    const map = new Map(data.subnets.map((s) => [s.id, s.cidr]));
    return (id: string) => map.get(id) ?? '—';
  }, [data.subnets]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setSelectedSubnets([]);
    setDialogOpen(true);
  };

  const openEdit = (v: Vlan) => {
    setEditing(v);
    setForm({ vlanId: String(v.vlanId), name: v.name, gateway: v.gateway, note: v.note });
    setSelectedSubnets(v.subnetIds);
    setDialogOpen(true);
  };

  const toggleSubnet = (id: string) => {
    setSelectedSubnets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = () => {
    const vlanId = Number(form.vlanId);
    if (!form.vlanId.trim() || Number.isNaN(vlanId)) {
      toast.error('请输入有效的 VLAN ID（数字）');
      return;
    }
    if (vlanId < 1 || vlanId > 4094) {
      toast.error('VLAN ID 范围为 1 ~ 4094');
      return;
    }
    if (!form.name.trim()) {
      toast.error('请输入 VLAN 名称');
      return;
    }
    const payload = {
      vlanId,
      name: form.name.trim(),
      gateway: form.gateway.trim(),
      subnetIds: selectedSubnets,
      note: form.note.trim(),
    };
    if (editing) {
      updateVlan(editing.id, payload);
      toast.success('VLAN 已更新');
    } else {
      addVlan(payload);
      toast.success('VLAN 已新增');
    }
    setDialogOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const res = deleteVlan(deleteTarget.id);
    if (!res.ok) {
      toast.error(res.reason);
    } else {
      toast.success('VLAN 已删除');
    }
    setDeleteTarget(null);
  };

  return (
    <div>
      <PageHeader
        title="VLAN管理"
        description="管理虚拟局域网配置，关联子网实现网络隔离"
        actions={
          canCreate && (
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> 新增 VLAN
            </Button>
          )
        }
      />

      <Card className="p-4 md:p-5">
        {data.vlans.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">暂无 VLAN，点击「新增 VLAN」开始</div>
        ) : (
          <div className="w-full max-w-full overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">VLAN ID</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">名称</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">网关</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">关联子网</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">备注</th>
                  <th className="whitespace-nowrap py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.vlans.map((v) => (
                  <tr key={v.id}>
                    <td className="whitespace-nowrap py-3 pr-4 font-medium tabular-nums">{v.vlanId}</td>
                    <td className="whitespace-nowrap py-3 pr-4">{v.name}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground tabular-nums">{v.gateway || '—'}</td>
                    <td className="max-w-[16rem] py-3 pr-4">
                      {v.subnetIds.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {v.subnetIds.map((sid) => (
                            <span key={sid} className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground tabular-nums">
                              {subnetName(sid)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="max-w-[12rem] truncate whitespace-nowrap py-3 pr-4 text-muted-foreground">{v.note || '—'}</td>
                    <td className="whitespace-nowrap py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(v)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(v)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑 VLAN' : '新增 VLAN'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>VLAN ID *</Label>
                <Input type="number" value={form.vlanId} onChange={(e) => setForm({ ...form, vlanId: e.target.value })} placeholder="1 ~ 4094" />
              </div>
              <div className="space-y-2">
                <Label>VLAN 名称 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 办公VLAN" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>网关地址</Label>
              <Input value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })} placeholder="如 192.168.1.1" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>关联子网</Label>
              {data.subnets.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无子网，请先在「子网规划」中创建</p>
              ) : (
                <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
                  {data.subnets.map((s) => (
                    <label key={s.id} className="flex min-h-12 items-center gap-2 text-sm">
                      <Checkbox checked={selectedSubnets.includes(s.id)} onCheckedChange={() => toggleSubnet(s.id)} />
                      <span className="min-w-0 truncate tabular-nums">{s.cidr}</span>
                    </label>
                  ))}
                </div>
              )}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除 VLAN</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除 VLAN <span className="text-foreground">{deleteTarget?.name}</span>（ID: {deleteTarget?.vlanId}）吗？若仍关联子网将无法删除。
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