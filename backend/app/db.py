from collections.abc import Iterator

from sqlalchemy import event, inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from app import config

engine = create_engine(f"sqlite:///{config.DB_PATH}", connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _sqlite_pragmas(conn, _record) -> None:
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA journal_mode=WAL")
    cur.close()


def init_db() -> None:
    from app import models  # noqa: F401  register tables

    config.ensure_dirs()
    SQLModel.metadata.create_all(engine)
    _add_missing_columns()
    _backfill()


def _backfill() -> None:
    """Data fixes after additive migrations, and venues that arrived with models/ from git."""
    from app.modelstore import store, unique_slug
    from app.models import Team, Venue

    with Session(engine) as s:
        teams = list(s.exec(select(Team).order_by(Team.id)))
        taken: set[str] = set()
        for team in teams:
            if team.slug is None or team.slug in taken:
                team.slug = unique_slug(team.name, taken)
                s.add(team)
            taken.add(team.slug)
        known = {v.slug for v in s.exec(select(Venue))}
        for slug, name in store().known_venues().items():
            if slug not in known:
                s.add(Venue(name=name, slug=slug))
        s.commit()


def _add_missing_columns() -> None:
    """create_all() doesn't touch existing tables, so new model fields are added here.
    Only additive changes are supported: new columns must be nullable or have a scalar default."""
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                ddl = column.type.compile(dialect=engine.dialect)
                default = column.default.arg if column.default is not None and not callable(column.default.arg) else None
                clause = f" DEFAULT {int(default) if isinstance(default, bool) else repr(default)}" if default is not None else ""
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {ddl}{clause}'))


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
