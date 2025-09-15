# Repository Guidelines

This is a pnpm-based TypeScript monorepo for a WeChat Markdown editor. Keep changes focused, small, and consistent with the existing structure and tooling.

## Project Structure & Module Organization
- `apps/web` — Web app and browser extension (Vite + Vue 3).
- `apps/vscode` — VS Code extension (webpack build).
- `packages/core` — Markdown rendering core.
- `packages/shared` — Shared configs, constants, types, utils.
- `packages/config` — Base TS configs.
- `packages/md-cli` — CLI package built from web assets.
- `docs`, `scripts`, `docker`, `public` — Documentation, helper scripts, container, static assets.

## Build, Test, and Development Commands
- `pnpm install` — Install workspace dependencies (Node >= 20, pnpm >= 10).
- `pnpm start` or `pnpm web dev` — Run the web app locally.
- `pnpm web build` — Build the web app (production).
- `pnpm build:cli` — Build and pack the CLI from web dist.
- `pnpm type-check` — TypeScript project-wide type checks.
- `pnpm lint` — ESLint with formatting; auto-fixes where possible.

## Coding Style & Naming Conventions
- Language: ESM TypeScript and Vue SFCs; strict TS settings.
- Formatting via ESLint (AntFu config). Semicolons: never; quotes: backticks.
- Indentation: 2 spaces. Keep imports sorted by tooling.
- File naming: kebab-case for files and folders; `PascalCase.vue` for Vue components; camelCase for variables/functions; UPPER_SNAKE_CASE for constants.

## Testing Guidelines
- No default unit test harness is present. Ensure `pnpm type-check`, `pnpm lint`, and a production `pnpm web build` pass.
- If adding tests, prefer Vitest + ESM. Place near sources as `*.spec.ts` or under `__tests__/`. Focus on pure logic in `packages/{core,shared}`.

## Commit & Pull Request Guidelines
- Conventional commits: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `chore`.
- Example: `feat(editor): support custom shortcuts`.
- Branch names: `feat/<short-desc>`, `fix/<short-desc>`, `docs/<short-desc>`.
- PRs: one focused change; link issues; include description, screenshots (UI), and docs updates for public changes. All checks (lint, types, build) must pass.

## Security & Configuration Tips
- Do not commit secrets. For local dev, put env in `apps/web/.env.local` (e.g., `VITE_LAUNCH_EDITOR=code`).
- Use `pnpm` commands (not `npm`/`yarn`). Do not commit build artifacts or lockfiles other than `pnpm-lock.yaml`.

## Agent-Specific Instructions
- Keep patches minimal and scoped; avoid unrelated edits.
- Follow this file’s guidance across the repo; nested AGENTS.md (if any) takes precedence.
- Use workspace scripts (`pnpm web dev/build`, `pnpm lint`, `pnpm type-check`) and respect existing ESLint rules.
