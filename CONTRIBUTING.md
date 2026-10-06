# Contributing to Ichibot

Thanks for helping improve Ichibot.

## Quick path

1. Fork the repository and create a focused branch.
2. Install Node.js 20+, pnpm, and Rust.
3. Run `pnpm install`.
4. Make the smallest focused change that solves the problem.
5. Run `pnpm test`, the TypeScript checks, and `cargo check` when relevant.
6. Open a pull request with the user-visible change, verification performed, and any known limitations.

## Development conventions

- Keep the sidecar protocol typed in `packages/shared`.
- Do not commit API keys, generated sidecars, build output, or personal session data.
- Keep tool execution behind explicit approval and preserve the safety limits.
- Prefer small, reviewable commits using conventional commit messages.
- Update the README when setup or user-visible behaviour changes.

## Pull requests

Include:

- What changed and why.
- How the change was tested.
- Screenshots or a short recording for UI changes.
- Any required configuration, credentials, or migration steps.
