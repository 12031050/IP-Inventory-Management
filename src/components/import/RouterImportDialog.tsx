import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, ArrowRight, CheckCircle2, FileSpreadsheet, Loader2 } from 'lucide-react';
import { parseFile } from '@/lib/import-export';
import { isValidIP, isValidMAC } from '@/lib/ip-utils';
import { useData } from '@/contexts/DataContext';
import { type IPStatus } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

type SystemField = 'ip' | 'mac' | 'hostname' | 'purpose' | 'note';

const FIELD_LABELS: Record<SystemField, string> = {
  ip: 'IP 地址',
  mac: 'MAC 地址',
  hostname: '主机名',
  purpose: '用途/设备类型',
  note: '备注',
};

const FIELD_REQUIRED: Record<SystemField, boolean> = {
  ip: true,
  mac: false,
  hostname: false,
  purpose: false,
  note: false,
};

function autoDetect(headers: string[]): Record<SystemField, string> {
  const mapping: Record<SystemField, string> = { ip: '', mac: '', hostname: '', purpose: '', note: '' };
  const rules: Record<SystemField, RegExp[]> = {
    ip: [/ip/i, /地址/i, /address/i, /addr/i],
    mac: [/mac/i, /物理/i, /hardware/i],
    hostname: [/host/i, /主机/i, /name/i, /名称/i, /设备名/i, /device/i],
    purpose: [/用途/i, /类型/i, /type/i, /接口/i, /interface/i, /描述/i, /desc/i],
    note: [/备注/i, /note/i, /comment/i, /说明/i, /描述/i, /remark/i],
  };
  const used = new Set<string>();
  (Object.keys(rules) as SystemField[]).forEach((field) => {
    for (const h of headers) {
      if (used.has(h)) continue;
      if (rules[field].some((re) => re.test(h))) {
        mapping[field] = h;
        used.add(h);
        break;
      }
    }
  });
  return mapping;
}

type Strategy = 'overwrite' | 'skip' | 'merge';

interface ImportResult {
  added: number;
  overwritten: number;
  merged: number;
  skipped: number;
  invalid: number;
}

export default function RouterImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { importIPRecord } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<SystemField, string>>({
    ip: '',
    mac: '',
    hostname: '',
    purpose: '',
    note: '',
  });
  const [strategy, setStrategy] = useState<Strategy>('skip');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setStep('upload');
    setHeaders([]);
    setRows([]);
    setMapping({ ip: '', mac: '', hostname: '', purpose: '', note: '' });
    setStrategy('skip');
    setImporting(false);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      toast.error('仅支持 CSV 或 Excel（.xlsx/.xls）格式');
      e.target.value = '';
      return;
    }
    const { rows: parsed, errors } = await parseFile(file);
    if (errors.length > 0) {
      toast.error(errors[0]);
      e.target.value = '';
      return;
    }
    if (parsed.length === 0) {
      toast.error('文件中没有可导入的数据');
      e.target.value = '';
      return;
    }
    const hdrs = Object.keys(parsed[0]);
    setHeaders(hdrs);
    setRows(parsed);
    setMapping(autoDetect(hdrs));
    setStep('mapping');
    e.target.value = '';
  };

  const mappedPreview = rows.slice(0, 5).map((row) => ({
    ip: row[mapping.ip] ?? '',
    mac: row[mapping.mac] ?? '',
    hostname: row[mapping.hostname] ?? '',
    purpose: row[mapping.purpose] ?? '',
    note: row[mapping.note] ?? '',
  }));

  const canProceed = !!mapping.ip;

  const doImport = () => {
    setImporting(true);
    let added = 0;
    let overwritten = 0;
    let merged = 0;
    let skipped = 0;
    let invalid = 0;
    rows.forEach((row) => {
      const ip = (row[mapping.ip] ?? '').trim();
      if (!ip || !isValidIP(ip)) {
        invalid++;
        return;
      }
      const mac = (row[mapping.mac] ?? '').trim();
      const rec = {
        ip,
        hostname: (row[mapping.hostname] ?? '').trim(),
        mac: mac && isValidMAC(mac) ? mac : '',
        purpose: (row[mapping.purpose] ?? '').trim(),
        subnetId: null,
        status: 'allocated' as IPStatus,
        note: (row[mapping.note] ?? '').trim(),
      };
      const res = importIPRecord(rec, strategy);
      added += res.added;
      overwritten += res.overwritten;
      merged += res.merged;
      skipped += res.skipped;
    });
    setResult({ added, overwritten, merged, skipped, invalid });
    setImporting(false);
  };

  const closeResult = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto md:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> 导入路由器/交换机地址表
          </DialogTitle>
          <DialogDescription className="text-pretty">
            上传路由器或交换机导出的地址表（CSV/Excel），配置字段映射后批量导入 IP 台账。
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">导入完成</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="新增" value={result.added} tone="primary" />
              <Stat label="覆盖" value={result.overwritten} tone="primary" />
              <Stat label="合并" value={result.merged} tone="primary" />
              <Stat label="跳过" value={result.skipped} tone="muted" />
              <Stat label="无效" value={result.invalid} tone="destructive" />
            </div>
            <DialogFooter>
              <Button onClick={closeResult}>完成</Button>
            </DialogFooter>
          </div>
        ) : step === 'upload' ? (
          <div className="space-y-4 py-2">
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">点击选择文件上传</p>
                <p className="mt-1 text-xs text-muted-foreground">支持 CSV、Excel（.xlsx/.xls）格式</p>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
            <p className="text-xs text-muted-foreground text-pretty">
              常见解表头：IP Address / IP地址、MAC Address / MAC地址、Hostname / 主机名、Device Type / 设备类型、Interface / 接口、Remark / 备注 等，系统会自动识别并匹配。
            </p>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={step === 'mapping' ? 'default' : 'secondary'}>1. 字段映射</Badge>
              <ArrowRight className="h-3 w-3" />
              <Badge variant={step === 'preview' ? 'default' : 'secondary'}>2. 预览与导入</Badge>
            </div>

            {step === 'mapping' ? (
              <>
                <div className="space-y-3">
                  {(Object.keys(FIELD_LABELS) as SystemField[]).map((field) => (
                    <div key={field} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      <div className="w-32 shrink-0 text-sm">
                        <span className={FIELD_REQUIRED[field] ? 'text-foreground' : 'text-muted-foreground'}>
                          {FIELD_LABELS[field]}
                          {FIELD_REQUIRED[field] && <span className="text-destructive"> *</span>}
                        </span>
                      </div>
                      <Select
                        value={mapping[field] || 'none'}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v === 'none' ? '' : v }))}
                      >
                        <SelectTrigger className="w-full sm:w-64">
                          <SelectValue placeholder="选择对应列" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">不导入此字段</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      reset();
                      onOpenChange(false);
                    }}
                  >
                    取消
                  </Button>
                  <Button disabled={!canProceed} onClick={() => setStep('preview')}>
                    下一步：预览
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div>
                  <p className="mb-2 text-sm font-medium">数据预览（前 5 条）</p>
                  <div className="w-full max-w-full overflow-x-auto rounded-lg border border-border bg-card">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                          <th className="whitespace-nowrap px-3 py-2 font-medium">IP 地址</th>
                          <th className="whitespace-nowrap px-3 py-2 font-medium">MAC 地址</th>
                          <th className="whitespace-nowrap px-3 py-2 font-medium">主机名</th>
                          <th className="whitespace-nowrap px-3 py-2 font-medium">用途</th>
                          <th className="whitespace-nowrap px-3 py-2 font-medium">备注</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {mappedPreview.map((r, i) => (
                          <tr key={i}>
                            <td className="whitespace-nowrap px-3 py-2 font-mono">{r.ip || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">{r.mac || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2">{r.hostname || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2">{r.purpose || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{r.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">共解析到 {rows.length} 条记录</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">冲突处理策略</p>
                  <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as Strategy)}>
                    <label className="flex min-h-12 items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <RadioGroupItem value="skip" id="str-skip" />
                      <div>
                        <p className="text-sm font-medium">跳过（推荐）</p>
                        <p className="text-xs text-muted-foreground">IP 已存在时保留原记录，不导入</p>
                      </div>
                    </label>
                    <label className="flex min-h-12 items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <RadioGroupItem value="overwrite" id="str-over" />
                      <div>
                        <p className="text-sm font-medium">覆盖</p>
                        <p className="text-xs text-muted-foreground">IP 已存在时用导入数据完整覆盖</p>
                      </div>
                    </label>
                    <label className="flex min-h-12 items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <RadioGroupItem value="merge" id="str-merge" />
                      <div>
                        <p className="text-sm font-medium">合并</p>
                        <p className="text-xs text-muted-foreground">IP 已存在时仅补充原记录的空白字段</p>
                      </div>
                    </label>
                  </RadioGroup>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setStep('mapping')}>
                    上一步
                  </Button>
                  <Button disabled={importing} onClick={doImport}>
                    {importing ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" /> 导入中...
                      </>
                    ) : (
                      <>确认导入 {rows.length} 条</>
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'primary' | 'muted' | 'destructive';
}) {
  const cls =
    tone === 'destructive'
      ? 'text-destructive'
      : tone === 'primary'
        ? 'text-primary'
        : 'text-muted-foreground';
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
      <p className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}