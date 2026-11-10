// CSV / Excel 导入导出工具（基于 SheetJS，纯前端离线）
import * as XLSX from 'xlsx';

export interface ImportResult {
  rows: Record<string, string>[];
  errors: string[];
}

function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function rowsToObjects(data: string[][]): Record<string, string>[] {
  if (data.length < 2) return [];
  const headers = data[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < data.length; i++) {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (data[i][idx] ?? '').trim();
    });
    out.push(obj);
  }
  return out;
}

export function parseFile(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    const errors: string[] = [];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (ext === 'csv') {
          const text = typeof data === 'string' ? data : new TextDecoder().decode(data ?? new ArrayBuffer(0));
          const rows = rowsToObjects(parseCSVText(text));
          resolve({ rows, errors });
        } else {
          if (!(data instanceof ArrayBuffer)) {
            errors.push('文件解析失败：无法读取文件内容');
            resolve({ rows: [], errors });
            return;
          }
          const wb = XLSX.read(data, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
          const rows = json.map((r) => {
            const obj: Record<string, string> = {};
            Object.keys(r).forEach((k) => {
              obj[k] = String(r[k] ?? '').trim();
            });
            return obj;
          });
          resolve({ rows, errors });
        }
      } catch (err) {
        errors.push(`文件解析失败：${(err as Error).message}`);
        resolve({ rows: [], errors });
      }
    };
    reader.onerror = () => {
      errors.push('文件读取失败，请重试');
      resolve({ rows: [], errors });
    };
    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  const bom = '\﻿';
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function exportToExcel(filename: string, headers: string[], rows: (string | number)[][]): void {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}