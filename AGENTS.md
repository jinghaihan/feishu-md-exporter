# AGENTS

## Architecture Rules

- `src/types.ts` is the single source of truth for shared type definitions.
- `src/constants.ts` is the single source of truth for shared constants and limits.
- `src/schema.ts` is the single source of truth for runtime data schemas (API response validation and decoding).
- `src/utils/` contains reusable helper functions. Avoid duplicating helpers in feature modules.
- Import utils only via the barrel file `src/utils/index.ts` (for example `from './utils'`), not from `src/utils/*` subpaths in feature modules.
- Feature modules (`src/client.ts`, `src/discover.ts`, `src/cli.ts`, etc.) should compose types/constants/utils instead of redefining them.
- For function ordering: keep exported functions at the top-level section first, then internal/private methods below; sort internal methods by call flow and intent, and keep similar-intent methods adjacent.

## Refactor Checklist

- If a value is reused across modules or controls behavior (limits, endpoints, defaults), move it to `src/constants.ts`.
- If a function can be reused or is pure logic, move it to `src/utils/`.
- If a shape/type is shared across modules, move it to `src/types.ts`.
- Prefer one implementation path per behavior to keep a single source of truth.

## Coding Notes

- Keep modules small and focused.
- Keep error messages actionable and include API path/context.
- Keep changes type-safe under strict TypeScript settings.
- Before finishing any code change, run `pnpm lint --fix` and `pnpm typecheck`, and ensure both commands pass.
