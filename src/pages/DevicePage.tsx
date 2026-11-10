import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { isValidMAC } from '@/lib/ip-utils';
import { DEVICE_TYPES, type Device } from '@/types';
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

const emptyForm = { name: '', type: '', location: '', ip: '', mac: '', note: '' };

export default function DevicePage() {
  const { data, addDevice, updateDevice, deleteDevice } = useData();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('devices:create');
  const canEdit = hasPermission('devices:edit');
  const canDelete = hasPermission('devices:delete');

  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return data.devices.filter((d) => {
      const matchKw =
        !kw ||
        d.name.toLowerCase().includes(kw) ||
        d.location.toLowerCase().includes(kw) ||
        d.ip.toLowerCase().includes(kw);
      const matchType = typeFilter === 'all' || d.type === typeFilter;
      return matchKw && matchType;
    });
  }, [data.devices, keyword, typeFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (d: Device) => {
    setEditing(d);
    setForm({ name: d.name, type: d.type, location: d.location, ip: d.ip, mac: d.mac, note: d.note });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('请输入设备名称');
      return;
    }
    if (!form.type) {
      toast.error('请选择设备类型');
      return;
    }
    if (form.mac.trim() && !isValidMAC(form.mac.trim())) {
      toast.error('MAC 地址格式错误，示例：00:1A:2B:3C:4D:5E');
      return;
    }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      location: form.location.trim(),
      ip: form.ip.trim(),
      mac: form.mac.trim(),
      note: form.note.trim(),
    };
    if (editing) {
      updateDevice(editing.id, payload);
      toast.success('设备已更新');
    } else {
      addDevice(payload);
      toast.success('设备已新增');
    }
    setDialogOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteDevice(deleteTarget.id);
    toast.success('设备已删除');
    setDeleteTarget(null);
  };

  return (
    <div>
      <PageHeader
        title="设备资产管理"
        description="记录网络设备资产信息，便于运维定位与排查"
        actions={
          canCreate && (
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> 新增设备
            </Button>
          )
        }
      />

      <Card className="p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索设备名称、位置或 IP"
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {DEVICE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {data.devices.length === 0 ? '暂无设备记录，点击「新增设备」开始' : '没有匹配的记录'}
          </div>
        ) : (
          <div className="w-full max-w-full overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">设备名称</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">类型</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">位置</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">IP 地址</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">MAC 地址</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">备注</th>
                  <th className="whitespace-nowrap py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap py-3 pr-4 font-medium">{d.name}</td>
                    <td className="whitespace-nowrap py-3 pr-4">
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">{d.type}</span>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4">{d.location || '—'}</td>
                    <td className="whitespace-nowrap py-3 pr-4 tabular-nums">{d.ip || '—'}</td>
                    <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs text-muted-foreground">{d.mac || '—'}</td>
                    <td className="max-w-[12rem] truncate whitespace-nowrap py-3 pr-4 text-muted-foreground">{d.note || '—'}</td>
                    <td className="whitespace-nowrap py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(d)}>
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
            <DialogTitle>{editing ? '编辑设备' : '新增设备'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>设备名称 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 Core-SW-01" />
              </div>
              <div className="space-y-2">
                <Label>设备类型 *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>位置</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="如 机房A-机柜3" />
              </div>
              <div className="space-y-2">
                <Label>IP 地址</Label>
                <Input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="如 192.168.1.1" className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>MAC 地址</Label>
              <Input value={form.mac} onChange={(e) => setForm({ ...form, mac: e.target.value })} placeholder="00:1A:2B:3C:4D:5E" className="font-mono" />
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
            <AlertDialogTitle>确认删除设备</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除设备「{deleteTarget?.name}」吗？此操作不可撤销。
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