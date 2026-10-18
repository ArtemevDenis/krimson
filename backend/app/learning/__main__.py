"""CLI for the heavy steps, e.g. training on the Windows machine. Scope: `general`, `venue/<slug>`, `team/<slug>`.

    uv run python -m app.learning evaluate --scope venue/domashniy-zal
    uv run python -m app.learning tune --scope venue/domashniy-zal
    uv run python -m app.learning ball-dataset --scope venue/domashniy-zal
    uv run python -m app.learning train-ball --scope venue/domashniy-zal [--data D:/datasets/ball] [--epochs 60]
    uv run python -m app.learning players-dataset --scope team/krimson
    uv run python -m app.learning train-players --scope team/krimson [--data ...]

New versions land in models/ (git-tracked): commit and push them, pull on the other device.
"""

import argparse
import json
import sys
from pathlib import Path

from app.db import init_db
from app.learning import tasks

COMMANDS = {
    "evaluate": tasks.run_evaluate,
    "tune": tasks.run_tune,
    "ball-dataset": tasks.run_ball_dataset,
    "train-ball": tasks.run_train_ball,
    "players-dataset": tasks.run_players_dataset,
    "train-players": tasks.run_train_players,
}


def _progress(p: float) -> None:
    sys.stdout.write(f"\r{p:6.1%}")
    sys.stdout.flush()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.learning", description="Krimson: обучение на проверенных партиях")
    parser.add_argument("command", choices=list(COMMANDS))
    parser.add_argument("--scope", default="general", help="general | venue/<слаг зала> | team/<слаг команды>")
    parser.add_argument("--data", type=Path, help="папка датасета для train-* (например, скопированная с другого устройства)")
    parser.add_argument("--epochs", type=int)
    args = parser.parse_args(argv)
    init_db()
    payload = {"scope": args.scope, "data": str(args.data) if args.data else None, "epochs": args.epochs}
    result = COMMANDS[args.command](payload, _progress)
    print()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
