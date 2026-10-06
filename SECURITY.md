# Security policy

## Supported versions

Only the latest version on the default branch is currently supported.

## Reporting a vulnerability

Do not open a public issue for a security vulnerability. Contact the project maintainer privately with:

- A short description of the issue.
- Reproduction steps or a proof of concept.
- The affected version and platform.
- Any suggested mitigation.

Remove API keys, personal data, and session contents from reports. If no private security contact has been configured for the repository yet, create one before publishing the project.

## Security notes

- API keys are stored in the macOS Keychain.
- Tool commands require approval and have conservative limits, but shell execution is not a complete OS sandbox.
- Never include `.env`, Keychain contents, or `~/.ichibot/sessions.json` in an issue or pull request.
