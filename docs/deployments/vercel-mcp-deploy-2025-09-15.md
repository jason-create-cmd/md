# Vercel MCP 部署日志（2025-09-15）

> 说明：本次在本地/CI 环境通过 Vercel CLI（MCP 方式）尝试部署，未配置凭证（VERCEL_TOKEN）导致无法完成登录与实际部署。已完整记录命令与输出，便于后续补充令牌后复跑。并提供截图占位与采集指引。

## 环境信息

- Node: `v22.14.0`
- pnpm: `10.5.2`
- Vercel CLI: `48.0.0`
- 仓库根含 `vercel.json`（Install：pnpm install --frozen-lockfile；Build：pnpm web build；Output：apps/web/dist；Env：SERVER_ENV=NETLIFY）

## 执行命令与完整输出

```bash
node -v
pnpm -v
npx -y vercel --version
npx -y vercel whoami --debug
npx -y vercel deploy --cwd . --debug --confirm
```

```text
v22.14.0
10.5.2
Vercel CLI 48.0.0
48.0.0
> [debug] [2025-09-15T05:50:31.699Z] Found config in file "D:\\2_Workspace\\6_codex_Project\\md\\vercel.json"
Vercel CLI 48.0.0
> [debug] [2025-09-15T05:50:31.707Z] user supplied known subcommand: "whoami"
Error: No existing credentials found. Please run `vercel login` or pass "--token"
Learn More: https://err.sh/vercel/no-credentials-found
> [debug] [2025-09-15T05:50:34.963Z] Found config in file "D:\\2_Workspace\\6_codex_Project\\md\\vercel.json"
Vercel CLI 48.0.0
> [debug] [2025-09-15T05:50:34.971Z] user supplied known subcommand: "deploy"
Error: No existing credentials found. Please run `vercel login` or pass "--token"
Learn More: https://err.sh/vercel/no-credentials-found
```

## 结果与结论

- 结果：部署未执行，因未登录/无令牌（`No existing credentials found`）。
- 结论：满足 Vercel 部署要求，但需提供凭证后方可完成 MCP/CLI 部署。

## 复现与继续执行（提供令牌后）

```bash
# 使用令牌（推荐在 CI/MCP 环境）
# Windows PowerShell: $env:VERCEL_TOKEN="<token>"
# Bash: export VERCEL_TOKEN="<token>"

npx vercel whoami --token $env:VERCEL_TOKEN
npx vercel link --confirm --cwd . --token $env:VERCEL_TOKEN
npx vercel deploy --prod --confirm --cwd . --token $env:VERCEL_TOKEN
```

## 截图清单（占位）

> 将截图放置于 `docs/screenshots/` 目录，并在本文中引用。

- General 设置（Root/Install/Build/Output/Node）
  - 路径：`docs/screenshots/vercel-settings-general.png`
  - 引用：

    ![Vercel General Settings](../screenshots/vercel-settings-general.png)

- 环境变量（SERVER_ENV）
  - 路径：`docs/screenshots/vercel-settings-env.png`

    ![Vercel Environment Variables](../screenshots/vercel-settings-env.png)

- 部署日志（Build Logs 页面）
  - 路径：`docs/screenshots/vercel-deploy-logs.png`

    ![Vercel Build Logs](../screenshots/vercel-deploy-logs.png)

- CLI 终端日志截图（本页命令输出对应的终端窗口）
  - 路径：`docs/screenshots/vercel-cli-whoami-deploy.png`

    ![Vercel CLI Logs](../screenshots/vercel-cli-whoami-deploy.png)

## 备注

- 如不希望依赖 `SERVER_ENV` 控制 `base`，可调整 `apps/web/vite.config.ts`：在 Vercel 环境（`process.env.VERCEL`）自动设为 `'/'`。
- `apps/web/functions/*` 为 Cloudflare Pages Functions，如需在 Vercel 使用相同能力，迁移为 `api/*`。
