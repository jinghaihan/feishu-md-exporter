# feishu-md-exporter

[![npm version][npm-version-src]][npm-version-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

## Usage

```bash
pnpm start --url "https://my.feishu.cn/docx/TEST_DOCX_TOKEN_001" \
  --app-id "<your-app-id>" \
  --app-secret "<your-app-secret>"
```

This command recursively discovers linked Feishu documents starting from `--url`,
writes a manifest JSON to `./output/manifest.json`, and exports markdown files into `./output`.

### Options

- `--url <url>`: root document url (required)
- `--app-id <appId>`: Feishu app id (required unless `FEISHU_APP_ID` is set)
- `--app-secret <appSecret>`: Feishu app secret (required unless `FEISHU_APP_SECRET` is set)
- `--skip-discover`: skip discovery stage and export from existing manifest
- `--output <path>`: output directory for manifest + markdown (default `output`)
- `--manifest <name>`: manifest file name under output directory (default `manifest.json`)
- `--max-depth <n>`: max recursive depth (default `10`)
- `--max-docs <n>`: max discovered docs (default `1000`)
- `--page-size <n>`: API page size (default `200`, range `1-500`)
- `--debug`: print detailed HTTP/debug logs to stderr

## Configuration

Config file is supported via `unconfig`:

- `feishu-md-exporter.config.ts`

Example:

```ts
import { defineConfig } from 'feishu-md-exporter'

export default defineConfig({
  url: 'https://my.feishu.cn/docx/TEST_DOCX_TOKEN_001',
  maxDepth: 10,
  maxDocs: 1000,
  pageSize: 200,
})
```

Environment variables are also supported:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_PAGE_SIZE`
- `FEISHU_DEBUG`
- `FEISHU_SKIP_DISCOVER`

`.env` and `.env.local` in cwd are loaded automatically.

### Export With Existing Manifest

If you already have `output/manifest.json`, you can skip discovery and run export only:

```bash
pnpm start --skip-discover \
  --app-id "<your-app-id>" \
  --app-secret "<your-app-secret>"
```

### Where to find App ID / App Secret

1. Open [飞书开放平台](https://open.feishu.cn/)
2. Go to your app in 开发者后台 (self-built app)
3. Open `凭证与基础信息` (or similarly named credentials page)
4. Copy `App ID` and `App Secret`

## License

[MIT](./LICENSE) License © [jinghaihan](https://github.com/jinghaihan)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/feishu-md-exporter?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/feishu-md-exporter
[npm-downloads-src]: https://img.shields.io/npm/dm/feishu-md-exporter?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/feishu-md-exporter
[bundle-src]: https://img.shields.io/bundlephobia/minzip/feishu-md-exporter?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=feishu-md-exporter
[license-src]: https://img.shields.io/badge/license-MIT-blue.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/jinghaihan/feishu-md-exporter/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/feishu-md-exporter
