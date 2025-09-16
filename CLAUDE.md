# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **WeChat Markdown Editor** - a highly simplified markdown editor for WeChat that supports markdown syntax, custom themes, content management, multiple image hosting services, and AI assistant features.

- **Main Application**: Vue 3 + TypeScript web application with browser extension support
- **Architecture**: pnpm monorepo with multiple packages and applications
- **Target**: Browser-based markdown editor optimized for WeChat content creation

## Development Commands

### Core Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm start
# OR
pnpm web dev

# Build for production
pnpm web build

# Build for Netlify deployment (root directory)
pnpm web build:h5-netlify

# Type checking
pnpm type-check
# OR for web app specifically
pnpm web type-check

# Linting
pnpm lint

# Build and package CLI tool
pnpm build:cli
```

### Browser Extensions

```bash
# Chrome extension development
pnpm web ext:dev
# Visit chrome://extensions/ → Developer mode → Load unpacked → select .output/chrome-mv3-dev

# Package Chrome extension
pnpm web ext:zip

# Firefox extension development
pnpm web firefox:dev

# Package Firefox extension
pnpm web firefox:zip
```

### CLI Tool Development

```bash
# Build CLI distribution
pnpm build:cli

# Release CLI to npm
pnpm release:cli
```

## Architecture

### Monorepo Structure

- **`apps/web/`**: Main Vue 3 web application and browser extensions
- **`apps/vscode/`**: VSCode extension
- **`packages/core/`**: Core markdown rendering engine
- **`packages/shared/`**: Shared utilities, types, and constants
- **`packages/config/`**: Project-level configurations (TypeScript, etc.)
- **`packages/md-cli/`**: Command-line tool package
- **`packages/example/`**: WeChat public account API proxy service example

### Key Technologies

- **Frontend**: Vue 3 + TypeScript + Vite + TailwindCSS 4.x
- **State Management**: Pinia
- **Editor**: CodeMirror 5.x
- **Markdown**: marked + custom processors
- **Build**: Vite 6.x with multiple targets (web, browser extension)
- **Linting**: ESLint (@antfu/eslint-config) with backticks as quotes preference

### Web App Key Features

- Real-time markdown rendering optimized for WeChat
- Multiple image hosting integrations (GitHub, Aliyun OSS, Tencent Cloud COS, Qiniu, MinIO, etc.)
- Custom theme system with CSS customization
- AI assistant integration (DeepSeek, OpenAI, Tongyi Qianwen, etc.)
- Local content management with auto-save
- Export functionality for various formats

## Configuration Notes

### ESLint Rules

- Uses @antfu/eslint-config with Vue and TypeScript
- Enforces backticks for quotes (`quotes: ['error', 'backtick']`)
- No semicolons (`semi: ['error', 'never']`)
- Console and debugger allowed during development

### TypeScript

- Base config in `packages/config/tsconfig.base.json`
- Strict type checking enabled for production builds

### Deployment

- **Primary**: Vercel with custom build configuration in `vercel.json`
- **Alternative**: Netlify support with `SERVER_ENV=NETLIFY`
- **CLI**: Available as `@doocs/md-cli` npm package

## Working with Packages

### Web Application (`@md/web`)

The main application entry point. All web-related development should focus here.

### Core Package (`@md/core`)

Contains the markdown processing engine. Changes here affect all consumers.

### Shared Package (`@md/shared`)

Common utilities and types used across all packages. Update carefully as changes affect entire codebase.

## Development Workflow

1. **Feature Development**: Work primarily in `apps/web/`
2. **Core Logic**: Markdown processing changes go in `packages/core/`
3. **Cross-Package Changes**: Update `packages/shared/` for utilities used by multiple packages

## Image Hosting Configuration

### Cloudflare R2 CORS Setup

If using Cloudflare R2 as image hosting, you **must** configure CORS policy in your R2 bucket to avoid "Failed to fetch" errors during image uploads.

**Required CORS Configuration:**

```json
[
  {
    "AllowedOrigins": [
      "https://md.operonai.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedHeaders": ["Content-Type", "Authorization"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**Setup Steps:**

1. Log into Cloudflare Dashboard
2. Go to R2 → Select your bucket
3. Navigate to Settings → CORS Policy
4. Add the JSON configuration above
5. Replace `https://md.operonai.com` with your actual domain

**Note**: Without proper CORS configuration, image uploads will generate URLs but files won't be stored in the bucket, resulting in 404 errors when accessing the images. 4. **Testing**: Run `pnpm web build` to verify web app builds correctly 5. **Type Safety**: Always run `pnpm type-check` before committing

## Browser Extension Notes

The web app doubles as a browser extension using WXT framework:

- Development: `pnpm web ext:dev`
- Chrome build: `.output/chrome-mv3-dev`
- Firefox support available with separate commands

## CLI Tool

The CLI tool (`@doocs/md-cli`) packages the built web application for local server deployment. Changes to web app automatically affect CLI distribution when rebuilt.
