# cli — `osb` Command-Line Interface

**Generated:** 2026-04-28 | **Branch:** dev | **Commit:** 451c346

## OVERVIEW
Python CLI (`osb`) for sandbox lifecycle management, command execution, file I/O, egress policy, and diagnostics. Built on Typer; depends on the Python sandbox SDK (`opensandbox`).

## STRUCTURE
```
cli/
├── src/opensandbox_cli/
│   ├── main.py           # CLI entry point; registers all command groups
│   ├── client.py         # Sandbox API client wrapper
│   ├── config.py         # Config file (~/.osb.toml) read/write
│   ├── output.py         # Output formatting (JSON, raw, table)
│   ├── utils.py          # Shared helpers
│   ├── skill_registry.py # "Skills" plugin registry
│   ├── commands/         # One file per command group:
│   │   ├── sandbox.py    # osb sandbox create/list/get/kill/pause/resume
│   │   ├── command.py    # osb command run/status/output
│   │   ├── file.py       # osb file read/write/list/delete
│   │   ├── config_cmd.py # osb config init/get/set
│   │   ├── devops.py     # osb diagnostics logs/events/inspect
│   │   ├── egress.py     # osb egress get/patch
│   │   └── skills.py     # osb skills list/run
│   └── skills/           # Bundled skill implementations
├── tests/                # pytest tests
└── assets/               # Shell completions, man pages
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| New subcommand | Add file in `commands/`, register in `main.py` |
| Output formatting | `output.py` (JSON, raw, table modes) |
| Config persistence | `config.py` (~/.osb.toml) |
| Skills system | `skill_registry.py` + `skills/` |
| API calls | `client.py` → Python sandbox SDK |

## CONVENTIONS
- Python package manager: **uv** (`pyproject.toml` at `cli/`)
- Linter: **ruff**; type checker: **pyright**
- Output modes: `--output {json,raw,table}` — always route output through `output.py`, never raw `print()`
- Config stored in `~/.osb.toml`; override with `OSB_CONFIG_PATH` env var
- CI: `sdk-tests.yml` runs `uv run ruff check` + `uv run pyright` + `uv run pytest tests/ -v`

## ANTI-PATTERNS
- Never call the lifecycle HTTP API directly from command handlers — always go through `client.py`
- Do not add business logic in `main.py`; keep it pure registration
- Never use `print()` for user-visible output — use `output.py` formatters

## COMMANDS
```bash
cd cli
uv sync
uv run ruff check
uv run pyright
uv run pytest tests/ -v

# Install locally
uv tool install .

# Run
osb --help
```
