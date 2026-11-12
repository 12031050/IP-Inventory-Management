import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const LABEL_CLASS = 'mb-2 block text-[14px] font-semibold text-white';
const INPUT_CLASS =
  'h-11 w-full rounded-md border border-[#2d2e33] bg-[#1b1c1f] px-3.5 text-[14px] text-white outline-none transition-colors placeholder:text-[#6d6e74] focus:border-blue-500';

/** 首次部署（或旧版本升级）时，在飞牛授权之后出现的「创建管理员帐号」向导。 */
export default function SetupAdminPage() {
  const { setupMode, setupUsername, setupAdmin, nasInfo } = useAuth();
  const username = setupUsername || nasInfo?.username || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const tooShort = password.length > 0 && password.length < 6;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 6 && confirm.length > 0 && password === confirm && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const res = await setupAdmin(password);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? '创建管理员账号失败');
      return;
    }
    toast.success(setupMode === 'setPassword' ? '管理员密码设置成功' : '管理员账号创建成功，欢迎使用！');
  };

  return (
    <div className="min-h-screen w-full bg-[#111214] text-white">
      <div className="mx-auto w-full max-w-[760px] px-6 py-10 md:py-14">
        <h1 className="text-[22px] font-semibold tracking-wide text-white md:text-[24px]">
          {setupMode === 'setPassword' ? '设置管理员密码' : '创建管理员帐号'}
        </h1>

        <form onSubmit={handleSubmit} className="mt-9" noValidate>
          <div className="mb-8">
            <label htmlFor="setup-username" className={LABEL_CLASS}>
              用户名
              <span className="ml-1.5 text-[11px] font-normal text-white/35">（由飞牛系统账号自动识别）</span>
            </label>
            <input
              id="setup-username"
              value={username}
              readOnly
              autoComplete="username"
              className={`${INPUT_CLASS} cursor-default`}
            />
          </div>

          <div className="mb-8">
            <label htmlFor="setup-password" className={LABEL_CLASS}>
              密码
            </label>
            <div className="relative">
              <input
                id="setup-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="new-password"
                className={`${INPUT_CLASS} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label="显示或隐藏密码"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8b90] transition-colors hover:text-white"
              >
                {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            {tooShort && <p className="mt-2 text-[12px] text-red-400">密码至少 6 位</p>}
          </div>

          <div className="mb-8">
            <label htmlFor="setup-confirm" className={LABEL_CLASS}>
              确认密码
            </label>
            <div className="relative">
              <input
                id="setup-confirm"
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="请再次输入密码"
                autoComplete="new-password"
                className={`${INPUT_CLASS} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label="显示或隐藏确认密码"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8b90] transition-colors hover:text-white"
              >
                {showConfirm ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            {mismatch && <p className="mt-2 text-[12px] text-red-400">两次输入的密码不一致</p>}
          </div>

          <div className="mb-8">
            <label htmlFor="setup-nas-account" className={LABEL_CLASS}>
              关联 NAS 管理员帐号
            </label>
            <input
              id="setup-nas-account"
              value={username}
              readOnly
              className="h-11 w-full cursor-not-allowed rounded-md border border-[#26272b] bg-[#17181a] px-3.5 text-[14px] text-[#7c7d82] outline-none"
            />
          </div>

          <div className="mt-10 flex justify-end">
            <button
              type="submit"
              disabled={!canSubmit}
              className={`h-10 min-w-[84px] rounded-md px-5 text-[13px] transition-colors ${
                canSubmit
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'cursor-not-allowed bg-[#3a3b3f] text-[#8c8d92]'
              }`}
            >
              {submitting ? '请稍候...' : '下一步'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
