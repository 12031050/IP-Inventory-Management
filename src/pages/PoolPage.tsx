import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Zap } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { isValidIPv4, isIPInRange } from '@/lib/ip-utils';
import type { AddressPool } from '@/types';
import PageHeader from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const emptyForm = { name: '', startIp: '', endIp: '', subnetId: '', purpose: '', note: '' };

export default function PoolPage() {
  const { data, addPool, updatePool, deletePool, allocateFromPool } = useData();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('pools:create');
  const canEdit = hasPermission('pools:edit');
  const canDelete = hasPermission('pools:delete');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AddressPool | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<AddressPool | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (p: AddressPool) => {
    setEditing(p);
    setForm({ name: p.name, startIp: p.startIp, endIp: p.endIp, subnetId: p.subnetId ?? '', purpose: p.purpose, note: p.note });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('请输入地址池名称');
      return;
    }
    if (!isValidIPv4(form.startIp.trim()) || !isValidIPv4(form.endIp.trim())) {
      toast.error('起始/结束 IP 格式错误，请输入有效的 IPv4 地址');
      return;
    }
    if (!isIPInRange(form.endIp.trim(), form.startIp.trim(), form.endIp.trim())) {
      toast.error('结束 IP 必须大于等于起始 IP');
      return;
    }
    const payload = {
      name: form.name.trim(),
      startIp: form.startIp.trim(),
      endIp: form.endIp.trim(),
      subnetId: form.subnetId || null,
      purpose: form.purpose.trim(),
      note: form.note.trim(),
    };
    if (editing) {
      updatePool(editing.id, payload);
      toast.success('地址池已更新');
    } else {
      addPool(payload);
      toast.success('地址池已创建');
    }
    setDialogOpen(false);
  };

  const handleAllocate = (poolId: string) => {
    const res = allocateFromPool(poolId);
    if (!res.ok) {
      toast.error(res.reason);
      return;
    }
    toast.success(`已从地址池分配 IP：${res.ip}`);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deletePool(deleteTarget.id);
    toast.success('地址池已删除');
    setDeleteTarget(null);
  };

  return (
    <div>
      <PageHeader
        title="地址池管理"
        description="创建 IP 地址范围池，一键自动分配未占用地址"
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> 新建地址池
          </Button>
        }
      />

      <Card className="p-4 md:p-5">
        {data.pools.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">暂无地址池，点击「新建地址池」开始</div>
        ) : (
          <div className="w-full max-w-full overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">名称</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">起始 IP</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">结束 IP</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">所属子网</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">用途</th>
                  <th className="whitespace-nowrap py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.pools.map((p) => {
                  const subnet = data.subnets.find((s) => s.id === p.subnetId);
                  return (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap py-3 pr-4 font-medium">{p.name}</td>
                      <td className="whitespace-nowrap py-3 pr-4 tabular-nums">{p.startIp}</td>
                      <td className="whitespace-nowrap py-3 pr-4 tabular-nums">{p.endIp}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground tabular-nums">{subnet ? subnet.cidr : '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4">{p.purpose || '—'}</td>
                      <td className="whitespace-nowrap py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={() => handleAllocate(p.id)}>
                            <Zap className="mr-1 h-3.5 w-3.5" /> 分配
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(p)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑地址池' : '新建地址池'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>地址池名称 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 DHCP动态分配" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>起始 IP *</Label>
                <Input value={form.startIp} onChange={(e) => setForm({ ...form, startIp: e.target.value })} placeholder="如 192.168.1.100" className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>结束 IP *</Label>
                <Input value={form.endIp} onChange={(e) => setForm({ ...form, endIp: e.target.value })} placeholder="如 192.168.1.200" className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>所属子网</Label>
              <Select value={form.subnetId} onValueChange={(v) => setForm({ ...form, subnetId: v === 'none' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择子网（可选）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未关联子网</SelectItem>
                  {data.subnets.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.cidr} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>用途</Label>
              <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="如 动态分配、访客网络" />
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
            <AlertDialogTitle>确认删除地址池</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除地址池「{deleteTarget?.name}」吗？此操作不可撤销。
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