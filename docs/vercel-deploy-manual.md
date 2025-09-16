# Vercel 部署手册 v1.1（2025-09-15）

## 概览与现状评估

- 项目为 pnpm monorepo（Vite + Vue 3），网页产物输出到 `apps/web/dist`。
- 已满足 Vercel 部署要求：
  - 根目录存在 `vercel.json`（安装/构建/产物目录已配置）。
  - `apps/web/vite.config.ts` 已更新为在 `process.env.VERCEL` 存在时自动将 `base` 设为 `/`，避免静态资源 404。
  - 根 `package.json` 新增 `engines.node ">=20"`，建议在 Vercel 项目设置固定 Node 为 `20.x`。
- 注意：`apps/web/functions/*` 为 Cloudflare Pages Functions，在 Vercel 不执行；如需代理，请迁移到 `api/*`（Vercel Functions）或配置外部 `proxyOrigin`。

## 部署环境配置（Dashboard）

1. 导入项目：Vercel → Add New → Import Git Repository → 选择本仓库。
2. 推荐：将 Root Directory 设为 `apps/web`（子包作为根部署）
   - Root Directory: `apps/web`
   - Install Command: `pnpm -w install --frozen-lockfile`
   - Build Command: `pnpm run build`
   - Output Directory: `dist`
   - Node.js Version: `20.x`
   - 说明：`apps/web/vercel.json` 已提供相同配置；Dashboard 可保持默认使用该文件。
3. 环境变量：当前 `vite.config.ts` 已在 Vercel 环境自动将 `base` 设为 `/`，无需额外变量。
4. 点击 Deploy，等待构建完成；访问预览/生产链接验证页面与静态资源加载正常。

示例截图（占位，放入 `docs/screenshots/` 后生效）：
![General](./screenshots/vercel-settings-general.png)
![Env](./screenshots/vercel-settings-env.png)
![Logs](./screenshots/vercel-deploy-logs.png)

## 依赖与本地验证

```bash
corepack enable && corepack prepare pnpm@10 --activate
node -v   # v20.x
pnpm -v   # 10.x
pnpm install --frozen-lockfile
pnpm web dev
pnpm web build   # 产物在 apps/web/dist
```

## Vercel CLI（可选，非交互/自动化）

```bash
# 使用令牌（推荐在 CI/MCP 环境）
npx vercel whoami --token <VERCEL_TOKEN>
# 首次绑定项目（在仓库根目录）
npx vercel link --confirm --cwd . --token <VERCEL_TOKEN>
# 预览部署（Root 指向 apps/web）
npx vercel deploy --confirm --cwd apps/web --token <VERCEL_TOKEN>
# 生产部署（Root 指向 apps/web）
npx vercel deploy --prod --confirm --cwd apps/web --token <VERCEL_TOKEN>
# 可选：本地构建并上传
# 本地验证构建产物存在于 apps/web/dist
cd apps/web && pnpm install --offline || pnpm -w install --frozen-lockfile && pnpm run build && ls dist
npx vercel deploy --prebuilt --prod --confirm --cwd . --token <VERCEL_TOKEN>
```

## 域名绑定

- Project → Settings → Domains → Add → 输入自有域名。
- DNS（域名服务商处）：
  - Apex（顶级域）A → `76.76.21.21`
  - 子域（如 `www`）CNAME → `cname.vercel-dns.com`
- 将主域设为 Primary，并配置 `www` ↔ apex 的 Redirect；SSL 证书由 Vercel 自动签发与续期。

## 常见问题排查

- 静态资源 404：确认 `vite.config.ts` 在 Vercel 环境下 `base` 为 `/`（本版本已内置）。
- 构建失败/产物路径错误：确认 Build/Output 与 `vercel.json` 一致（`apps/web/dist`）。
- 子包缺依赖：使用仓库根构建；或在 `apps/web` 增加所需 devDependencies。
- 函数不可用：迁移到 `api/*`（Vercel Functions）或改为外部 `proxyOrigin`。
- CLI 凭证缺失：`npx vercel login` 或使用 `--token <VERCEL_TOKEN>`（可加 `--debug` 排查）。

## 回滚方案

- Dashboard：Project → Deployments → 选择稳定版本 → “Promote to Production”。
- CLI：

```bash
npx vercel list --prod --limit 10 --cwd . --token <VERCEL_TOKEN>
npx vercel promote <deployment-url> --prod --cwd . --token <VERCEL_TOKEN>
```

- Git 回退：`git revert <sha>` → `git push origin main` 触发新部署。

## 附录

- MCP 尝试与日志：`docs/deployments/vercel-mcp-deploy-2025-09-15.md`
- 根 `vercel.json`：

```json
{
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm web build",
  "outputDirectory": "apps/web/dist",
  "env": { "SERVER_ENV": "NETLIFY" }
}
```

- `apps/web/vite.config.ts` 关键片段：

```ts
const base = process.env.VERCEL ? `/` : (process.env.SERVER_ENV === `NETLIFY` ? `/` : `/md/`)
```
