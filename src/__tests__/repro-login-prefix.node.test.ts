/**
 * 复现：登录接口在「检测到的网关前缀」与真实网关前缀不一致时返回 404/400。
 * 场景：页面运行在 iframe 中，pathname 未落在 /app/... 下 → API_BASE 退化为 ''，
 * 登录请求打到站点根路径 /api/auth/*，被网关静态层以「非 JSON 404」拦截。
 * 修复后 apiFetch 应在主候选 404 时自动回退到 /app/ipam 前缀并成功。
 */

// 模拟网关：仅 /app/ipam 前缀下的 /api/auth/* 由后端处理并返回 JSON 200；
// 其余（根路径 /api/auth/*）返回非 JSON 的 404（模拟被静态/网关层拦截）。
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function notFoundHtml(): Response {
  return new Response('<html>404 Not Found</html>', {
    status: 404,
    headers: { 'Content-Type': 'text/html' },
  });
}

function makeFetchMock() {
  const calls: string[] = [];
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('/app/ipam/api/auth/')) {
      return jsonResponse(200, { ok: true, user: { id: 'u1', username: 'demo' } });
    }
    // 根路径下的 auth 请求 → 非 JSON 404
    return notFoundHtml();
  });
}

async function importApi() {
  const mod = await import('@/lib/api');
  return mod;
}

describe('登录接口前缀回退', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('NAS 授权登录：主候选(根路径)404 时自动回退到 /app/ipam 并成功', async () => {
    // jsdom 默认 pathname='/' → API_BASE=''，模拟 iframe 未带网关前缀
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const { loginWithNasApi } = await importApi();
    const res = await loginWithNasApi();

    // 决定性断言：授权登录成功（而非「飞牛 NAS 授权登录失败」）
    expect(res.ok).toBe(true);
    expect(res.user?.username).toBe('demo');
    // 且确实发生了回退：先打根路径(404)，再打 /app/ipam(200)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/nas-login');
    expect(fetchMock.mock.calls[1][0]).toBe('/app/ipam/api/auth/nas-login');
  });

  it('账号密码登录：主候选(根路径)404 时自动回退到 /app/ipam 并成功', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const { loginWithPasswordApi } = await importApi();
    const res = await loginWithPasswordApi('demo', 'secret');

    // 决定性断言：账号密码登录成功（而非 404）
    expect(res.ok).toBe(true);
    expect(res.user?.username).toBe('demo');
    expect(fetchMock.mock.calls[1][0]).toBe('/app/ipam/api/auth/login');
  });

  it('前缀正确时(/app/ipam)：直接命中，无需回退即成功', async () => {
    // 模拟页面 pathname 在网关前缀下 → API_BASE='/app/ipam'
    vi.stubGlobal('window', { location: { pathname: '/app/ipam/' } });
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const { loginWithNasApi } = await importApi();
    const res = await loginWithNasApi();

    expect(res.ok).toBe(true);
    // 首个请求即带正确前缀并 200，只调用一次
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/app/ipam/api/auth/nas-login');
  });
});
