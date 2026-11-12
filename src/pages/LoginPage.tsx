import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';

// 飞牛经典牛头 Logo SVG
function FnosBullLogo({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 80" fill="currentColor" className={className}>
      {/* 飞牛标志性牛角与牛头几何轮廓 */}
      <path
        d="M20 12 C 16 28, 28 36, 38 38 C 34 42, 32 48, 32 56 C 32 68, 40 76, 50 76 C 60 76, 68 68, 68 56 C 68 48, 66 42, 62 38 C 72 36, 84 28, 80 12 C 70 20, 60 26, 50 26 C 40 26, 30 20, 20 12 Z"
        fill="currentColor"
      />
      {/* 内部镂空 F 造型特征 */}
      <path
        d="M44 42 H60 V48 H50 V54 H58 V60 H44 Z"
        fill="currentColor"
        className="opacity-90"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { login, loginWithNas, nasInfo } = useAuth();
  
  // 模式：默认为 'nas_auth'（飞牛系统授权卡片，完美还原用户截图），支持切换为 'password'（其他账号密码）
  const [authMode, setAuthMode] = useState<'nas_auth' | 'password'>('nas_auth');
  
  // 飞牛系统授权身份信息：用户名完全来自网关注入（/api/nas/user 探测），无则不伪造
  const deviceName = nasInfo?.hostname || '飞牛 NAS';
  const detectedUser = nasInfo?.username || '';
  const [nasUser, setNasUser] = useState(detectedUser);

  // nasInfo 在挂载后异步探测得到，就绪后同步到展示用户名
  useEffect(() => {
    if (nasInfo?.username) setNasUser(nasInfo.username);
  }, [nasInfo?.username]);

  // 账号密码表单状态
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  
  const [loading, setLoading] = useState(false);
  const [nasAuthLoading, setNasAuthLoading] = useState(false);

  // 点击飞牛系统「授权」按钮：身份由后端从网关注入头解析，前端不传递用户名
  const handleNasAuthConfirm = async () => {
    setNasAuthLoading(true);
    const res = await loginWithNas();
    setNasAuthLoading(false);
    // 首次部署或旧版本升级：交由 App 切换到「创建管理员帐号」向导，不弹错误
    if (res.needSetup) return;
    if (!res.ok) {
      toast.error(res.error ?? '飞牛系统授权登录失败');
      return;
    }
    toast.success('飞牛系统账号授权成功，欢迎使用！');
  };

  // 提交其他账号密码登录
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error('请输入用户名和密码');
      return;
    }
    setLoading(true);
    const res = await login(username, password);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? '登录失败');
      return;
    }
    toast.success('登录成功');
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center p-4 text-white select-none overflow-hidden font-sans">
      {/* 飞牛标志性绚丽极光流体背景壁纸 (100% 还原用户截图彩虹流体渐变背景) */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{
          background: `
            radial-gradient(circle at 10% 20%, rgba(255, 140, 50, 0.85) 0%, transparent 45%),
            radial-gradient(circle at 90% 15%, rgba(240, 90, 140, 0.8) 0%, transparent 40%),
            radial-gradient(circle at 50% 50%, rgba(130, 80, 220, 0.75) 0%, transparent 55%),
            radial-gradient(circle at 80% 85%, rgba(40, 180, 220, 0.85) 0%, transparent 50%),
            radial-gradient(circle at 20% 90%, rgba(30, 200, 160, 0.85) 0%, transparent 45%),
            linear-gradient(135deg, #f7a044 0%, #b85098 35%, #4f46e5 70%, #06b6d4 100%)
          `
        }}
      />
      {/* 微妙遮罩提升磨砂对比度 */}
      <div className="absolute inset-0 z-0 bg-black/15 backdrop-blur-[2px]" />

      {/* 模式 1：飞牛系统授权主卡片 (完全像素级还原用户截图 Image1) */}
      {authMode === 'nas_auth' ? (
        <div className="relative z-10 w-full max-w-[340px] rounded-3xl border border-white/25 bg-white/15 dark:bg-black/25 p-7 shadow-2xl backdrop-blur-2xl text-center text-white animate-in zoom-in-95 duration-200">
          {/* 飞牛经典白色牛头 LOGO */}
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center text-white drop-shadow-[0_4px_16px_rgba(255,255,255,0.3)]">
            <FnosBullLogo className="w-14 h-14" />
          </div>

          {/* 飞牛设备名称 */}
          <h2 className="text-base font-semibold tracking-wide text-white/95 mb-5 drop-shadow-sm">
            {deviceName}
          </h2>

          {/* 飞牛系统当前账户胶囊展示条 */}
          <div className="mx-auto mb-5 flex items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/20 dark:bg-white/10 px-4 py-3 shadow-inner backdrop-blur-md">
            {/* 头像圆徽 */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-md shadow-blue-600/30">
              {nasUser ? nasUser.charAt(0).toLowerCase() : <ShieldCheck className="h-4 w-4" />}
            </div>
            {/* 账户名：显示网关探测到的真实 NAS 用户名，未探测到时提示 */}
            <span className="text-sm font-semibold text-white tracking-wider">
              {nasUser || '当前 NAS 账号'}
            </span>
          </div>

          {/* 请求授权文案 */}
          <p className="mb-6 text-xs leading-relaxed text-white/90 px-1 text-pretty drop-shadow-sm">
            “IP台账管理” 正在请求你的 NAS 账号登录，是否确认授权？
          </p>

          {/* 授权核心按钮 */}
          <Button
            type="button"
            onClick={handleNasAuthConfirm}
            disabled={nasAuthLoading}
            className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm shadow-lg shadow-blue-600/40 transition-all active:scale-[0.98]"
          >
            {nasAuthLoading ? '正在授权...' : '授 权'}
          </Button>

          {/* 切换使用其他账号 */}
          <div className="mt-4 pt-1">
            <button
              type="button"
              onClick={() => setAuthMode('password')}
              className="text-xs text-amber-200 hover:text-white transition-colors drop-shadow-sm font-normal py-1 px-3"
            >
              使用其他账号
            </button>
          </div>
        </div>
      ) : (
        /* 模式 2：其他账号密码登录表单 */
        <div className="relative z-10 w-full max-w-[380px] rounded-3xl border border-white/20 bg-slate-900/80 p-7 shadow-2xl backdrop-blur-2xl text-white animate-in zoom-in-95 duration-200">
          <div className="mb-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setAuthMode('nas_auth')}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>返回飞牛授权</span>
            </button>
            <span className="text-xs text-blue-400 font-medium">账号密码登录</span>
          </div>

          <div className="mb-5 text-center">
            <h2 className="text-lg font-bold text-white flex items-center justify-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-400" />
              <span>登录 IP台账管理</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">{deviceName}</p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs font-normal text-slate-300">
                用户名
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
                className="h-10 border-white/10 bg-black/40 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-normal text-slate-300">
                密码
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  className="h-10 border-white/10 bg-black/40 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(v) => setRememberMe(!!v)}
                  className="border-white/20 data-[state=checked]:bg-blue-600"
                />
                <span>记住账号</span>
              </label>
              <button
                type="button"
                onClick={() => toast.info('请在飞牛系统控制面板或联系管理员重置')}
                className="hover:text-slate-200"
              >
                忘记密码？
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm shadow-md transition-all mt-2"
            >
              {loading ? '登录中...' : '登录'}
            </Button>
          </form>

          <div className="mt-5 border-t border-white/10 pt-3 text-center">
            <button
              type="button"
              onClick={() => setAuthMode('nas_auth')}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              ← 使用飞牛系统授权一键登录
            </button>
          </div>
        </div>
      )}

      {/* 底部 SQLite 存储说明 */}
      <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none z-10">
        <p className="text-[11px] text-white/70 drop-shadow flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
          <span>本地飞牛 NAS SQLite 持久化 · 离线安全运行</span>
        </p>
      </div>
    </div>
  );
}
