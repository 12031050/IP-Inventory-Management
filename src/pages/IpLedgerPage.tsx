import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, AlertTriangle, CheckSquare, XSquare, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { isValidIP, isValidMAC, compareIP } from '@/lib/ip-utils';
import { IP_STATUS_LABELS, type IPRecord, type IPStatus } from '@/types';
import StatusBadge from '@/components/common/StatusBadge';
import PageHeader from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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

const STATUS_OPTIONS: IPStatus[] = ['allocated', 'unallocated', 'reserved', 'conflict'];

const emptyForm = {
  ip: '',
  hostname: '',
  mac: '',
  purpose: '',
  subnetId: '',
  status: 'allocated' as IPStatus,
  note: '',
};

export default function IpLedgerPage() {
  const { data, addIP, updateIP, deleteIP, deleteIPs, forceAddIP } = useData();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('ips:create');
  const canEdit = hasPermission('ips:edit');
  const canDelete = hasPermission('ips:delete');

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // 默认按 IP 地址数值从小到大升序排序
  const [ipSort, setIpSort] = useState<'asc' | 'desc' | 'none'>('asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IPRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [conflictExisting, setConflictExisting] = useState<IPRecord | null>(null);
  const [pendingForm, setPendingForm] = useState<typeof emptyForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IPRecord | null>(null);
  
  // 多选与批量删除状态
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const list = data.ips.filter((r) => {
      const matchKw =
        !kw ||
        r.ip.toLowerCase().includes(kw) ||
        r.hostname.toLowerCase().includes(kw) ||
        r.mac.toLowerCase().includes(kw);
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchKw && matchStatus;
    });
    if (ipSort === 'asc') list.sort((a, b) => compareIP(a.ip, b.ip));
    else if (ipSort === 'desc') list.sort((a, b) => compareIP(b.ip, a.ip));
    return list;
  }, [data.ips, keyword, statusFilter, ipSort]);

  // 计算当前筛选结果中被选中的 ID
  const filteredSelectedIds = useMemo(() => {
    const currentIds = new Set(filtered.map((r) => r.id));
    return selectedIds.filter((id) => currentIds.has(id));
  }, [filtered, selectedIds]);

  const isAllSelected = filtered.length > 0 && filteredSelectedIds.length === filtered.length;
  const isPartiallySelected = filteredSelectedIds.length > 0 && filteredSelectedIds.length < filtered.length;

  const handleSelectAll = () => {
    if (isAllSelected) {
      // 取消全选当前筛选结果
      const currentIds = new Set(filtered.map((r) => r.id));
      setSelectedIds((prev) => prev.filter((id) => !currentIds.has(id)));
    } else {
      // 全选当前筛选结果
      const currentIds = filtered.map((r) => r.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentIds])));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      toast.error('请先选择要删除的 IP 记录');
      return;
    }
    setBatchDeleteOpen(true);
  };

  const confirmBatchDelete = () => {
    const count = selectedIds.length;
    deleteIPs(selectedIds);
    setSelectedIds([]);
    setBatchDeleteOpen(false);
    toast.success(`已成功批量删除 ${count} 条 IP 记录`);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (rec: IPRecord) => {
    setEditing(rec);
    setForm({
      ip: rec.ip,
      hostname: rec.hostname,
      mac: rec.mac,
      purpose: rec.purpose,
      subnetId: rec.subnetId ?? '',
      status: rec.status,
      note: rec.note,
    });
    setDialogOpen(true);
  };

  const validate = (): string | null => {
    if (!form.ip.trim()) return '请输入 IP 地址';
    if (!isValidIP(form.ip.trim())) return 'IP 地址格式错误，请输入正确的 IPv4 或 IPv6 地址';
    if (form.mac.trim() && !isValidMAC(form.mac.trim())) return 'MAC 地址格式错误，示例：00:1A:2B:3C:4D:5E';
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const payload = {
      ip: form.ip.trim(),
      hostname: form.hostname.trim(),
      mac: form.mac.trim(),
      purpose: form.purpose.trim(),
      subnetId: form.subnetId || null,
      status: form.status,
      note: form.note.trim(),
    };
    if (editing) {
      const res = updateIP(editing.id, payload);
      if (res.conflict && res.existing) {
        setPendingForm(form);
        setConflictExisting(res.existing);
        return;
      }
      toast.success('IP 记录已更新');
      setDialogOpen(false);
    } else {
      const res = addIP(payload);
      if (res.conflict && res.existing) {
        setPendingForm(form);
        setConflictExisting(res.existing);
        return;
      }
      toast.success('IP 记录已新增');
      setDialogOpen(false);
    }
  };

  const confirmConflict = () => {
    if (!pendingForm) return;
    const payload = {
      ip: pendingForm.ip.trim(),
      hostname: pendingForm.hostname.trim(),
      mac: pendingForm.mac.trim(),
      purpose: pendingForm.purpose.trim(),
      subnetId: pendingForm.subnetId || null,
      status: 'conflict' as IPStatus,
      note: pendingForm.note.trim(),
    };
    if (editing) {
      updateIP(editing.id, payload);
      toast.success('已更新，该 IP 标记为冲突');
    } else {
      forceAddIP(payload, 'conflict');
      toast.success('已新增，该 IP 标记为冲突');
    }
    setConflictExisting(null);
    setPendingForm(null);
    setDialogOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteIP(deleteTarget.id);
    setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget.id));
    toast.success('IP 记录已删除');
    setDeleteTarget(null);
  };

  return (
    <div>
      <PageHeader
        title="IP台账管理"
        description="集中记录与管理所有 IP 地址，支持多选、全选与一键批量删除，录入时自动检测冲突"
        actions={
          <div className="flex items-center gap-2">
            {canDelete && selectedIds.length > 0 && (
              <Button variant="destructive" onClick={handleBatchDelete} className="gap-1.5 shadow-sm">
                <Trash2 className="h-4 w-4" /> 批量删除 ({selectedIds.length})
              </Button>
            )}
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" /> 新增 IP
              </Button>
            )}
          </div>
        }
      />

      <Card className="p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索 IP、主机名或 MAC 地址"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {IP_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={ipSort === 'none' ? 'outline' : 'secondary'}
            size="sm"
            onClick={() =>
              setIpSort((s) => (s === 'none' ? 'asc' : s === 'asc' ? 'desc' : 'none'))
            }
            className="h-9 shrink-0 gap-1.5"
          >
            {ipSort === 'asc' ? (
              <ArrowUp className="h-4 w-4" />
            ) : ipSort === 'desc' ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">IP 排序</span>
          </Button>
        </div>

        {/* 批量操作提示栏 */}
        {selectedIds.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm text-primary animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              <span>已选中 <strong className="font-semibold">{selectedIds.length}</strong> 条 IP 记录</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                <XSquare className="mr-1 h-3.5 w-3.5" /> 取消全选
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBatchDelete}
                className="h-7 text-xs gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" /> 一键删除选中
              </Button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <p className="text-sm">{data.ips.length === 0 ? '暂无 IP 记录，点击「新增 IP」开始' : '没有匹配的记录'}</p>
          </div>
        ) : (
          <div className="w-full max-w-full overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="w-10 whitespace-nowrap py-2 pl-2 pr-3 text-center">
                    <Checkbox
                      checked={isAllSelected ? true : isPartiallySelected ? 'indeterminate' : false}
                      onCheckedChange={handleSelectAll}
                      aria-label="全选/取消全选"
                      className="translate-y-[2px]"
                    />
                  </th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">
                    <button
                      type="button"
                      onClick={() =>
                        setIpSort((s) => (s === 'asc' ? 'desc' : 'asc'))
                      }
                      className="inline-flex items-center gap-1 text-left transition-colors hover:text-primary"
                    >
                      IP 地址
                      {ipSort === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : ipSort === 'desc' ? (
                        <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  </th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">主机名</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">MAC 地址</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">用途</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">所属子网</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">状态</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">备注</th>
                  <th className="whitespace-nowrap py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => {
                  const subnet = data.subnets.find((s) => s.id === r.subnetId);
                  const isChecked = selectedIds.includes(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors hover:bg-muted/40 ${
                        isChecked ? 'bg-primary/5' : ''
                      }`}
                    >
                      <td className="whitespace-nowrap py-3 pl-2 pr-3 text-center">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleToggleSelect(r.id)}
                          aria-label={`选择 ${r.ip}`}
                          className="translate-y-[2px]"
                        />
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 font-medium tabular-nums">{r.ip}</td>
                      <td className="whitespace-nowrap py-3 pr-4">{r.hostname || '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs text-muted-foreground">{r.mac || '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4">{r.purpose || '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground tabular-nums">{subnet ? subnet.cidr : '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="max-w-[12rem] truncate whitespace-nowrap py-3 pr-4 text-muted-foreground">{r.note || '—'}</td>
                      <td className="whitespace-nowrap py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(r)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          {!canEdit && !canDelete && (
                            <span className="text-xs text-muted-foreground">只读</span>
                          )}
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

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑 IP 记录' : '新增 IP 记录'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>IP 地址 *</Label>
              <Input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="如 192.168.1.10" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>主机名</Label>
                <Input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="如 NAS-01" />
              </div>
              <div className="space-y-2">
                <Label>MAC 地址</Label>
                <Input value={form.mac} onChange={(e) => setForm({ ...form, mac: e.target.value })} placeholder="00:1A:2B:3C:4D:5E" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>用途</Label>
                <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="如 服务器、摄像头" />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as IPStatus })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {IP_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Label>备注</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="可选备注信息" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 冲突告警确认 */}
      <AlertDialog open={!!conflictExisting} onOpenChange={(o) => !o && setConflictExisting(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> IP 地址冲突告警
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              IP 地址 <span className="font-mono font-semibold text-foreground">{conflictExisting?.ip}</span> 已存在记录
              （主机名：{conflictExisting?.hostname || '—'}）。若继续保存，两条记录都将被标记为「冲突」状态。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConflictExisting(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmConflict} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              仍然保存
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 单条删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除 IP 记录 <span className="font-mono text-foreground">{deleteTarget?.ip}</span> 吗？此操作不可撤销。
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

      {/* 批量删除确认弹窗 */}
      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> 确认批量删除
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              确定要批量删除选中的 <strong className="font-bold text-destructive">{selectedIds.length}</strong> 条 IP 记录吗？
              <br />
              <span className="text-xs text-muted-foreground mt-1 block">该操作将永久从台账中移除所选 IP，操作不可撤销。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBatchDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              一键确认删除 ({selectedIds.length})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
