// IP / CIDR / MAC 校验与计算工具（纯函数，离线可用）

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

export function isValidIPv4(ip: string): boolean {
  const m = ip.match(IPV4_RE);
  if (!m) return false;
  return m.slice(1, 5).every((seg) => {
    const n = Number(seg);
    return n >= 0 && n <= 255;
  });
}

export function isValidIPv6(ip: string): boolean {
  if (!ip.includes(':')) return false;
  const parts = ip.split(':');
  if (parts.length < 3 || parts.length > 8) return false;
  const hasDoubleColon = ip.includes('::');
  if (hasDoubleColon && parts.filter((p) => p === '').length > 2) return false;
  if (!hasDoubleColon && parts.length !== 8) return false;
  return parts.every((p) => {
    if (p === '') return true;
    if (p.length > 4) return false;
    return /^[0-9A-Fa-f]{1,4}$/.test(p);
  });
}

export function isValidIP(ip: string): boolean {
  return isValidIPv4(ip) || isValidIPv6(ip);
}

export function isValidMAC(mac: string): boolean {
  return MAC_RE.test(mac.trim());
}

export function isValidCIDR(cidr: string): boolean {
  const m = cidr.match(CIDR_RE);
  if (!m) return false;
  const prefix = Number(m[5]);
  if (prefix < 0 || prefix > 32) return false;
  return m.slice(1, 5).every((seg) => {
    const n = Number(seg);
    return n >= 0 && n <= 255;
  });
}

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function intToIp(int: number): string {
  return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
}

export interface SubnetInfo {
  network: string;
  broadcast: string;
  mask: string;
  prefix: number;
  total: number;
  usable: number;
  start: string;
  end: string;
}

export function parseCIDR(cidr: string): SubnetInfo | null {
  if (!isValidCIDR(cidr)) return null;
  const [ip, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  const int = ipToInt(ip);
  const mask = prefix === 0 ? 0 : (-1 << (32 - prefix)) >>> 0;
  const network = (int & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = prefix >= 32 ? 1 : Math.pow(2, 32 - prefix);
  const usable = prefix >= 31 ? total : total - 2;
  const start = prefix >= 31 ? intToIp(network) : intToIp(network + 1);
  const end = prefix >= 31 ? intToIp(broadcast) : intToIp(broadcast - 1);
  return {
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    mask: intToIp(mask),
    prefix,
    total,
    usable,
    start,
    end,
  };
}

export function ipToIntValue(ip: string): number {
  return ipToInt(ip);
}

// IPv4 地址数值比较（用于排序，IPv4 按数值大小，IPv6 置于其后按字符串排序）
export function compareIP(a: string, b: string): number {
  const aV4 = isValidIPv4(a);
  const bV4 = isValidIPv4(b);
  if (aV4 && bV4) return ipToInt(a) - ipToInt(b);
  if (aV4) return -1;
  if (bV4) return 1;
  return a.localeCompare(b);
}

export function isIPInRange(ip: string, start: string, end: string): boolean {
  if (!isValidIPv4(ip) || !isValidIPv4(start) || !isValidIPv4(end)) return false;
  const v = ipToInt(ip);
  return v >= ipToInt(start) && v <= ipToInt(end);
}

export function isIPInSubnet(ip: string, cidr: string): boolean {
  const info = parseCIDR(cidr);
  if (!info || !isValidIPv4(ip)) return false;
  return isIPInRange(ip, info.start, info.end);
}

export function detectVersion(cidr: string): 'IPv4' | 'IPv6' {
  return cidr.includes(':') ? 'IPv6' : 'IPv4';
}

export function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN');
}

export function utilizationPercent(used: number, usable: number): number {
  if (usable <= 0) return 0;
  return Math.round((used / usable) * 100);
}

// 从地址池范围内查找第一个未占用的 IPv4 地址
export function findFirstFreeIP(
  start: string,
  end: string,
  usedIPs: string[],
): string | null {
  if (!isValidIPv4(start) || !isValidIPv4(end)) return null;
  const usedSet = new Set(usedIPs);
  const s = ipToInt(start);
  const e = ipToInt(end);
  for (let v = s; v <= e; v++) {
    const ip = intToIp(v);
    if (!usedSet.has(ip)) return ip;
  }
  return null;
}