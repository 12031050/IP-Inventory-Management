import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';
import { Shield, ShieldPlus, Pencil, Trash2, CheckCircle2, Lock, Info, Users, UserCog } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { type Role, type PermissionKey, PERMISSION_GROUPS } from '@/types';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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

const emptyForm = {
  name: '',
  description: '',
  permissions: [] as PermissionKey[],
};

export default function RoleManagementPage() {
  const { roles, users, hasPermission, addRole, updateRole, deleteRole } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const canCreate = hasPermission('roles:create');
  const canEdit = hasPermission('roles:edit');
  const canDelete = hasPermission('roles:delete');

  const openCreate = () => {
    setEditingRole(null);
    setForm({
      name: '',
      description: '',
      permissions: ['ips:view', 'subnets:view', 'vlans:view', 'pools:view', 'devices:view'],
    });
    setDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setForm({
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    });
    setDialogOpen(true);
  };

  const handleTogglePerm = (key: PermissionKey) => {
    setForm((prev) => {
      const exists = prev.permissions.includes(key);
      const next = exists
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key];
      return { ...prev, permissions: next };
    });
  };

  const handleToggleGroup = (groupId: string) => {
    const group = PERMISSION_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const groupKeys = group.permissions.map((p) => p.key);
    const allSelected = groupKeys.every((k) => form.permissions.includes(k));

    setForm((prev) => {
      let next: PermissionKey[];
      if (allSelected) {
        next = prev.permissions.filter((k) => !groupKeys.includes(k));
      } else {
        const set = new Set([...prev.permissions, ...groupKeys]);
        next = Array.from(set);
      }
      return { ...prev, permissions: next };
    });
  };

  const handleSelectAll = () => {
    const allKeys = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    const allSelected = allKeys.every((k) => form.permissions.includes(k));
    setForm((prev) => ({
      ...prev,
      permissions: allSelected ? [] : allKeys,
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('请输入角色名称');
      return;
    }

    if (editingRole) {
      const res = updateRole(editingRole.id, {
        name: form.name.trim(),
        description: form.description.trim(),
        permissions: form.permissions,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('角色权限配置已更新');
      setDialogOpen(false);
    } else {
      const res = addRole({
        name: form.name.trim(),
        description: form.description.trim(),
        permissions: form.permissions,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('新角色已创建');
      setDialogOpen(false);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const res = deleteRole(deleteTarget.id);
    if (!res.ok) {
      toast.error(res.error);
    } else {
      toast.success('角色已删除');
    }
    setDeleteTarget(null);
  };

  return (
    <div>
      <PageHeader
        title="角色管理"
        description="细粒度权限控制与角色配置体系，支持预置角色管理与自定义角色权限分配"
        actions={
          canCreate && (
            <Button onClick={openCreate} className="gap-1.5 shadow-sm">
              <ShieldPlus className="h-4 w-4" /> 创建角色
            </Button>
          )
        }
      />

      {/* 用户与权限导航切换 Tab */}
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-2">
        <NavLink
          to="/users"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`
          }
        >
          <UserCog className="h-4 w-4" />
          <span>用户账号列表</span>
        </NavLink>
        <NavLink
          to="/roles"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`
          }
        >
          <Shield className="h-4 w-4" />
          <span>角色与权限配置</span>
        </NavLink>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => {
          const userCount = users.filter((u) => u.roleId === role.id).length;
          const isSuperAdmin = role.id === 'role-admin';

          return (
            <Card key={role.id} className="flex flex-col border-border">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        isSuperAdmin
                          ? 'bg-primary/20 text-primary'
                          : role.isSystem
                            ? 'bg-secondary text-secondary-foreground'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <span>{role.name}</span>
                        {role.isSystem && (
                          <Badge variant="outline" className="text-xs font-normal">
                            系统预置
                          </Badge>
                        )}
                      </CardTitle>
                    </div>
                  </div>

                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Users className="h-3 w-3" />
                    <span>{userCount} 个用户</span>
                  </Badge>
                </div>
                <CardDescription className="mt-1 line-clamp-2 text-xs">
                  {role.description || '暂无角色描述信息'}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 space-y-3 pb-4">
                <div className="text-xs text-muted-foreground font-medium">权限概览：</div>
                <div className="flex flex-wrap gap-1.5">
                  {PERMISSION_GROUPS.map((group) => {
                    const groupKeys = group.permissions.map((p) => p.key);
                    const granted = groupKeys.filter((k) => role.permissions.includes(k));
                    if (granted.length === 0) return null;

                    const isFull = granted.length === groupKeys.length;
                    return (
                      <Badge
                        key={group.id}
                        variant={isFull ? 'default' : 'secondary'}
                        className="text-[11px] font-normal"
                      >
                        {group.label} ({granted.length}/{groupKeys.length})
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>

              <div className="mt-auto border-t border-border p-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  已分配 {role.permissions.length} 项具体权限
                </span>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(role)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      {isSuperAdmin ? '查看权限' : '配置权限'}
                    </Button>
                  )}
                  {canDelete && !role.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(role)}
                      title="删除角色"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 角色编辑与权限配置弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? `配置角色权限 - ${editingRole.name}` : '创建新角色并配置权限'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>角色名称 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：网络工程师"
                  disabled={editingRole?.isSystem}
                />
              </div>
              <div className="space-y-2">
                <Label>角色说明</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="该角色的职责与定位"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">权限配置清单</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-7 text-xs"
                >
                  全选 / 反选全部
                </Button>
              </div>

              {editingRole?.id === 'role-admin' && (
                <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-xs text-primary flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>超级管理员角色默认拥有系统所有权限，不可取消勾选。</span>
                </div>
              )}

              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 max-h-[50vh] overflow-y-auto">
                {PERMISSION_GROUPS.map((group) => {
                  const groupKeys = group.permissions.map((p) => p.key);
                  const selectedCount = groupKeys.filter((k) => form.permissions.includes(k)).length;
                  const isAll = selectedCount === groupKeys.length;
                  const isIndeterminate = selectedCount > 0 && selectedCount < groupKeys.length;

                  return (
                    <div key={group.id} className="rounded-md border border-border bg-card p-3">
                      <div className="flex items-center justify-between pb-2 border-b border-border/60">
                        <label className="flex items-center gap-2 font-medium text-sm cursor-pointer select-none">
                          <Checkbox
                            checked={isAll ? true : isIndeterminate ? 'indeterminate' : false}
                            onCheckedChange={() => handleToggleGroup(group.id)}
                            disabled={editingRole?.id === 'role-admin'}
                          />
                          <span>{group.label}</span>
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {selectedCount}/{groupKeys.length} 已选
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
                        {group.permissions.map((p) => {
                          const checked = form.permissions.includes(p.key);
                          return (
                            <label
                              key={p.key}
                              className="flex items-center gap-2 text-xs cursor-pointer select-none py-1 hover:text-primary transition-colors"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => handleTogglePerm(p.key)}
                                disabled={editingRole?.id === 'role-admin'}
                              />
                              <span>{p.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存配置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除角色</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除角色 <strong className="text-foreground">{deleteTarget?.name}</strong> 吗？
              如果该角色下关联有用户，需先将用户转移至其他角色。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
