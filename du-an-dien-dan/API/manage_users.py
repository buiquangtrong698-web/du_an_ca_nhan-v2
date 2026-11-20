from __future__ import annotations

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.orm import Session

from API.main import Role, User, create_database_engine, initialize_database


def main() -> None:
    load_dotenv(Path(__file__).resolve().parent / ".env")
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL đang để trống. Hãy điền API/.env trước.")

    parser = argparse.ArgumentParser(description="Quản lý vai trò tài khoản Học Cùng Vui.")
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("promote-admin", "promote-user"):
        subcommand = commands.add_parser(command)
        subcommand.add_argument("username", help="Tên tài khoản đã đăng ký")
    args = parser.parse_args()

    engine = create_database_engine(database_url)
    try:
        initialize_database(engine)
        with Session(engine) as db:
            user = db.scalar(select(User).where(User.username == args.username.strip().casefold()))
            if user is None:
                raise SystemExit(f"Không tìm thấy tài khoản {args.username}.")
            user.role = Role.ADMIN if args.command == "promote-admin" else Role.USER
            db.commit()
            print(f"Đã đặt vai trò {user.role.value} cho {user.username}.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
