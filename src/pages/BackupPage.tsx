import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { HardDriveDownload, RotateCcw, Trash2, Download, Upload, ShieldCheck } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function BackupPage() {
  const { data, createBackup, restoreBackup, deleteBackup, restoreFromFile } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ id: string; filename: string } | null>(null);

  const handleBackup = () => {
    const rec = createBackup();
    downloadText(rec.filename, rec.data);
    toast.success(`已创建备份：${rec.filename}`);
  };

  const confirmRestore = () => {
    if (!restoreTarget) return;
    const ok = restoreBackup(restoreTarget.id);
    if (ok) toast.success('数据已从备份恢复');
    setRestoreTarget(null);
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      toast.error('仅支持 JSON 备份文件');
      e.target.value = '';
      return;
    }
    const text = await file.text();
    const res = restoreFromFile(text);
    if (res.ok) toast.success('数据已从备份文件恢复');
    else toast.error(res.reason ?? '恢复失败');
    e.target.value = '';
  };

  return (
    <div>
      <PageHeader title="数据备份恢复" description="将全部数据备份为本地 JSON 文件，可随时恢复" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDriveDownload className="h-4 w-4 text-primary" /> 创建备份
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground text-pretty">
              将当前 IP 台账、子网、VLAN、地址池、设备资产等全部数据打包为 JSON 文件保存到本地。
            </p>
            <Button onClick={handleBackup}>
              <HardDriveDownload className="mr-1 h-4 w-4" /> 立即备份
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4 text-primary" /> 从文件恢复
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground text-pretty">
              选择此前导出的 JSON 备份文件恢复数据，将覆盖当前所有数据，请谨慎操作。
            </p>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> 选择备份文件
            </Button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleRestoreFile} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">备份历史</CardTitle>
            <span className="text-sm text-muted-foreground tabular-nums">{data.backups.length} 条</span>
          </div>
        </CardHeader>
        <CardContent>
          {data.backups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <ShieldCheck className="h-8 w-8 opacity-50" />
              <p className="text-sm">暂无备份记录，点击上方「立即备份」创建</p>
            </div>
          ) : (
            <div className="w-full max-w-full overflow-x-auto bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">文件名</th>
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">备份时间</th>
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">大小</th>
                    <th className="whitespace-nowrap py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.backups.map((b) => (
                    <tr key={b.id}>
                      <td className="whitespace-nowrap py-3 pr-4 font-medium">{b.filename}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{formatTime(b.timestamp)}</td>
                      <td className="whitespace-nowrap py-3 pr-4 tabular-nums text-muted-foreground">{formatSize(b.size)}</td>
                      <td className="whitespace-nowrap py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={() => setRestoreTarget({ id: b.id, filename: b.filename })}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> 恢复
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => downloadText(b.filename, b.data)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteBackup(b.id)}>
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
        </CardContent>
      </Card>

      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认恢复数据</AlertDialogTitle>
            <AlertDialogDescription>
              将从备份「{restoreTarget?.filename}」恢复数据，当前所有数据将被覆盖，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore} className="bg-primary text-primary-foreground hover:bg-primary/90">
              确认恢复
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}