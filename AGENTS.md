# Repository Guidelines

## Project Structure & Module Organization
- `backend/`: Flask entrypoint (`app.py`), `routes/` for APIs, `services/` & `generators/` for AI orchestration, `prompts/` for templates, `config.py` for provider loading.
- `frontend/`: Vue 3 + TypeScript (Vite). `src/api` for HTTP client, `views/` for pages, `components/` for shared UI, `stores/` (Pinia) for state, `composables/` for reuse, `assets/` for styling/media.
- `tests/`: Pytest fixtures live in `tests/conftest.py`; place API/service specs here.
- `docker/` and `docker-compose.yml` contain container defaults; `images/` and `history/` hold bundled assets and persisted runs. Provider templates live in `text_providers.yaml.example` and `image_providers.yaml.example`.

## Setup & Configuration
- Backend: Python 3.11+ with uv. Install deps via `uv sync`.
- Copy configs before running: `cp text_providers.yaml.example text_providers.yaml` and `cp image_providers.yaml.example image_providers.yaml`; fill API keys/base URLs. Keep secrets out of git; use local copies or compose overrides.
- Frontend: `cd frontend && pnpm install`. Vite dev server expects API on `http://localhost:12398` (already CORS-whitelisted).

## Build, Test, and Development Commands
- Backend dev: `uv run python -m backend.app` (serves API on 12398; serves built frontend when `frontend/dist` exists).
- Frontend dev: `cd frontend && pnpm dev` (5173). Build: `pnpm build`; preview bundle via `pnpm preview`.
- Tests: `uv run pytest` from repo root. Prefer fixtures/mocks over live provider calls.
- Docker: `docker-compose up -d` for full stack with persisted `history/` and `output/`.

## Coding Style & Naming Conventions
- Python: PEP 8, 4-space indent, snake_case modules/functions, favor type hints on public functions, keep logging through shared loggers instead of prints.
- Vue/TS: use `<script setup lang="ts">`, PascalCase components, kebab-case file names for SFCs, 2-space indent. Keep API calls in `src/api`, state in Pinia stores, and reusable logic in `composables/`.

## Testing Guidelines
- Name backend tests `test_*.py`; target route handlers, generator/service logic, and config validation (provider selection, YAML errors). Mock external HTTP/AI calls; assert JSON contracts and status codes.
- For UI changes, include screenshots in PRs and exercise flows against local backend; add unit tests when introducing new Pinia stores or composables.

## Commit & Pull Request Guidelines
- Follow conventional commits seen in history (`feat:`, `fix:`, `docs:`, `chore:`). One logical change per commit.
- PRs should include: concise summary, linked issue/story, commands run (`uv run pytest`, `pnpm build`), config changes/migrations, and UI screenshots when applicable.
- Note required API keys or new env values in the description; update README/AGENTS when workflows change.
