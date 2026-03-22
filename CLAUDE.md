# Project Rules

## Commit Messages
- Follow [Conventional Commits](https://www.conventionalcommits.org/) format: `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`, `ci`, `perf`, `build`
- Keep subject line under 72 characters
- Use imperative mood ("add feature" not "added feature")

## Security
- NEVER commit secrets, API keys, tokens, passwords, or credentials
- NEVER commit `.env` files, `credentials.json`, or similar sensitive files
- Secrets are managed via Doppler — reference env vars, never hardcode values
- Always verify `git diff` before committing to ensure no secrets are included
