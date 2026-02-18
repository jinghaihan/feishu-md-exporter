# feishu-downloader

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
and writes a JSON manifest to `./feishu-documents.json` by default.

### Options

- `--url <url>`: root document url (required)
- `--app-id <appId>`: Feishu app id (required unless `FEISHU_APP_ID` is set)
- `--app-secret <appSecret>`: Feishu app secret (required unless `FEISHU_APP_SECRET` is set)
- `--output <path>`: output JSON path (default `feishu-documents.json`)
- `--max-depth <n>`: max recursive depth (default `10`)
- `--max-docs <n>`: max discovered docs (default `1000`)
- `--page-size <n>`: API page size (default `200`, range `1-500`)

## Configuration

Config file is supported via `unconfig`:

- `feishu-downloader.config.ts`

Example:

```ts
import { defineConfig } from 'feishu-downloader'

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

`.env` and `.env.local` in cwd are loaded automatically.

### Where to find App ID / App Secret

1. Open [飞书开放平台](https://open.feishu.cn/)
2. Go to your app in 开发者后台 (self-built app)
3. Open `凭证与基础信息` (or similarly named credentials page)
4. Copy `App ID` and `App Secret`

## License

[MIT](./LICENSE) License © [jinghaihan](https://github.com/jinghaihan)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/feishu-downloader?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/feishu-downloader
[npm-downloads-src]: https://img.shields.io/npm/dm/feishu-downloader?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/feishu-downloader
[bundle-src]: https://img.shields.io/bundlephobia/minzip/feishu-downloader?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=feishu-downloader
[license-src]: https://img.shields.io/badge/license-MIT-blue.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/jinghaihan/feishu-downloader/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/feishu-downloader
