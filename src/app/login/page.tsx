export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form
        action="/api/auth/login"
        method="post"
        className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-950">CNC 工厂管理</h1>
        <p className="mt-1 text-sm text-slate-600">登录你的工厂账户</p>
        {error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            账号或密码不正确
          </p>
        ) : null}
        <label className="mt-5 block text-sm font-medium text-slate-700">
          账号
          <input
            name="username"
            className="mt-1 w-full rounded-md border px-3 py-2"
            autoComplete="username"
            required
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          密码
          <input
            name="password"
            type="password"
            className="mt-1 w-full rounded-md border px-3 py-2"
            autoComplete="current-password"
            required
          />
        </label>
        <button className="mt-6 w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
          登录
        </button>
      </form>
    </main>
  );
}
