import { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Users,
  UserPlus,
  Search,
  Pencil,
  Trash2,
  KeyRound,
  Shield,
  ShieldCheck,
  UserX,
  UserCheck,
  UserCog,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { type User } from '@/types';
import PageHeader from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

const emptyForm = {
  username: '',
  realName: '',
  password: '',
  roleId: 'role-operator',
};

export default function UserManagementPage() {
  const {
    users,
    roles,
    currentUser,
    hasPermission,
    addUser,
    updateUser,
    deleteUser,
    resetUserPassword,
    toggleUserStatus,
  } = useAuth();

  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // 弹窗状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  // 密码重置确认
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetResult, setResetResult] = useState<string | null>(null);

  const canCreate = hasPermission('users:create');
  const canEdit = hasPermission('users:edit');
  const canDelete = hasPermission('users:delete');

  const filteredUsers = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return users.filter((u) => {
      const matchKw =
        !kw ||
        u.username.toLowerCase().includes(kw) ||
        (u.realName && u.realName.toLowerCase().includes(kw));
      const matchRole = roleFilter === 'all' || u.roleId === roleFilter;
      const matchStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchKw && matchRole && matchStatus;
    });
  }, [users, keyword, roleFilter, statusFilter]);

  const openCreate = () => {
    setEditingUser(null);
    setForm({
      username: '',
      realName: '',
      password: '',
      roleId: roles[0]?.id || 'role-operator',
    });
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({
      username: user.username,
      realName: user.realName || '',
      password: '',
      roleId: user.roleId,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.username.trim()) {
      toast.error('请输入用户名');
      return;
    }
    if (!editingUser && !form.password) {
      toast.error('新建用户必须设置初始密码');
      return;
    }
    if (!editingUser && form.password.length < 4) {
      toast.error('密码长度至少 4 位');
      return;
    }

    if (editingUser) {
      const res = updateUser(editingUser.id, {
        username: form.username.trim(),
        realName: form.realName.trim(),
        roleId: form.roleId,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('用户信息已更新');
      setDialogOpen(false);
    } else {
      const res = addUser({
        username: form.username.trim(),
        realName: form.realName.trim(),
        password: form.password,
        roleId: form.roleId,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('用户已成功创建');
      setDialogOpen(false);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const res = deleteUser(deleteTarget.id);
    if (!res.ok) {
      toast.error(res.error);
    } else {
      toast.success('用户已删除');
    }
    setDeleteTarget(null);
  };

  const handleResetPassword = () => {
    if (!resetTarget) return;
    const pwd = newPassword.trim() || '123456';
    const res = resetUserPassword(resetTarget.id, pwd);
    if (!res.ok) {
      toast.error(res.error);
    } else {
      toast.success(`用户 ${resetTarget.username} 的密码已重置为：${pwd}`);
      setResetResult(pwd);
    }
    setResetTarget(null);
    setNewPassword('');
  };

  const handleToggleStatus = (user: User) => {
    const res = toggleUserStatus(user.id);
    if (!res.ok) {
      toast.error(res.error);
    } else {
      toast.success(
        user.status === 'active'
          ? `已禁用用户 ${user.username}`
          : `已启用用户 ${user.username}`,
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="系统多用户账号管理、角色权限分配、密码重置与账号启用/禁用状态控制"
        actions={
          canCreate && (
            <Button onClick={openCreate} className="gap-1.5 shadow-sm">
              <UserPlus className="h-4 w-4" /> 新增用户
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

      <Card className="p-4 md:p-5">
        {/* 搜索与筛选工具栏 */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索用户名、真实姓名"
              className="pl-9"
            />
          </div>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="全部角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">正常启用</SelectItem>
              <SelectItem value="disabled">已禁用</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Users className="h-10 w-10 stroke-[1.2]" />
            <p className="text-sm">没有找到匹配的用户账号</p>
          </div>
        ) : (
          <div className="w-full max-w-full overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="whitespace-nowrap py-2.5 pr-4 font-medium">用户名</th>
                  <th className="whitespace-nowrap py-2.5 pr-4 font-medium">真实姓名</th>
                  <th className="whitespace-nowrap py-2.5 pr-4 font-medium">所属角色</th>
                  <th className="whitespace-nowrap py-2.5 pr-4 font-medium">状态</th>
                  <th className="whitespace-nowrap py-2.5 pr-4 font-medium">创建时间</th>
                  <th className="whitespace-nowrap py-2.5 pr-4 font-medium">最后登录</th>
                  <th className="whitespace-nowrap py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((u) => {
                  const role = roles.find((r) => r.id === u.roleId);
                  const isSelf = u.id === currentUser?.id;
                  const isRootAdmin = !!u.isSuperAdmin;

                  return (
                    <tr key={u.id} className="transition-colors hover:bg-muted/40">
                      <td className="whitespace-nowrap py-3 pr-4 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{u.username}</span>
                          {isSelf && (
                            <Badge variant="outline" className="text-xs text-primary border-primary/30">
                              当前账号
                            </Badge>
                          )}
                          {isRootAdmin && (
                            <Badge variant="secondary" className="text-xs">
                              初始超级管理
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                        {u.realName || '—'}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4">
                        <Badge
                          variant={
                            role?.id === 'role-admin'
                              ? 'default'
                              : role?.id === 'role-operator'
                                ? 'secondary'
                                : 'outline'
                          }
                          className="gap-1 font-normal"
                        >
                          <Shield className="h-3 w-3" />
                          {role ? role.name : '未分配角色'}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4">
                        {u.status === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            正常
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-destructive font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                            已禁用
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-xs text-muted-foreground tabular-nums">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-xs text-muted-foreground tabular-nums">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString('zh-CN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '从未登录'}
                      </td>
                      <td className="whitespace-nowrap py-3 text-right">
                        <div className="flex justify-end items-center gap-1">
                          {canEdit && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => openEdit(u)}
                                title="编辑用户"
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" /> 编辑
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setResetTarget(u);
                                  setNewPassword('123456');
                                }}
                                title="重置密码"
                              >
                                <KeyRound className="h-3.5 w-3.5 mr-1" /> 重置密码
                              </Button>
                              {!isSelf && !isRootAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-8 text-xs ${
                                    u.status === 'active'
                                      ? 'text-amber-500 hover:text-amber-600'
                                      : 'text-emerald-500 hover:text-emerald-600'
                                  }`}
                                  onClick={() => handleToggleStatus(u)}
                                  title={u.status === 'active' ? '禁用账号' : '启用账号'}
                                >
                                  {u.status === 'active' ? (
                                    <>
                                      <UserX className="h-3.5 w-3.5 mr-1" /> 禁用
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="h-3.5 w-3.5 mr-1" /> 启用
                                    </>
                                  )}
                                </Button>
                              )}
                            </>
                          )}
                          {canDelete && !isSelf && !isRootAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(u)}
                              title="删除用户"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

      {/* 新增/编辑用户弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto md:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? '编辑用户信息' : '创建新用户'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>登录用户名 *</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="例如：operator01"
                disabled={editingUser?.isSuperAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>真实姓名 / 备注名</Label>
              <Input
                value={form.realName}
                onChange={(e) => setForm({ ...form, realName: e.target.value })}
                placeholder="例如：张三（网络组）"
              />
            </div>
            {!editingUser && (
              <div className="space-y-2">
                <Label>初始密码 *</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="至少 4 位字符"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>分配角色 *</Label>
              <Select
                value={form.roleId}
                onValueChange={(v) => setForm({ ...form, roleId: v })}
                disabled={editingUser?.isSuperAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择角色" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} {r.isSystem && '（系统预置）'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                角色决定该用户在系统中所拥有的功能菜单与操作权限。
              </p>
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

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除用户</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除用户 <strong className="text-foreground font-semibold">{deleteTarget?.username}</strong> 吗？
              删除后该用户将无法登录系统，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除用户
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 密码重置弹窗 */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> 重置用户密码
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              为用户 <strong className="text-foreground">{resetTarget?.username}</strong> 设置新密码：
            </p>
            <div className="space-y-1">
              <Label>新密码</Label>
              <Input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="默认为 123456"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              取消
            </Button>
            <Button onClick={handleResetPassword}>确认重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
