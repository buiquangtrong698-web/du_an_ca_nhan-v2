import hashlib
import mimetypes
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pwdlib import PasswordHash
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import Column, DateTime, Enum as SqlEnum, ForeignKey, JSON, MetaData, String, Table, create_engine, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(Path(__file__).resolve().parent / ".env")

SESSION_COOKIE = "hoc_cung_vui_session"
SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_FILE_SIGNATURES = {
    ".pdf": b"%PDF-",
    ".doc": b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",
    ".docx": b"PK\x03\x04",
}
PASSWORD_HASHER = PasswordHash.recommended()
SUBJECT_NAMES = {"Toán", "Vật Lý", "Hóa Học", "Tiếng Anh", "Ngữ Văn", "Sinh Học"}
PROTECTED_PAGE_PATHS = {
    "/",
    "/html",
    "/html/",
    "/html/index.html",
    "/html/khoa_hoc.html",
    "/html/luyen_de.html",
    "/html/tai_lieu.html",
    "/html/dien_dan.html",
}


class Role(str, Enum):
    USER = "user"
    ADMIN = "admin"


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str | None] = mapped_column(String(254), unique=True, index=True, nullable=True)
    username: Mapped[str | None] = mapped_column(String(32), unique=True, index=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(512))
    role: Mapped[Role] = mapped_column(
        SqlEnum(
            Role,
            name="user_role",
            native_enum=False,
            values_callable=lambda roles: [role.value for role in roles],
        ),
        default=Role.USER,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class UserSession(Base):
    __tablename__ = "user_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class LearningCourse(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    grade: Mapped[int]
    subject: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(1000))
    lessons: Mapped[int]
    level: Mapped[str] = mapped_column(String(80))
    topics: Mapped[list[str]] = mapped_column(JSON, default=list)


class PracticeExam(Base):
    __tablename__ = "exams"

    id: Mapped[int] = mapped_column(primary_key=True)
    grade: Mapped[int]
    subject: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(1000))
    _legacy_questions: Mapped[int] = mapped_column("questions", default=0)
    _legacy_duration: Mapped[int] = mapped_column("duration", default=0)
    level: Mapped[str] = mapped_column(String(80))
    topics: Mapped[list[str]] = mapped_column(JSON, default=list)
    file_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class StudyMaterial(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    grade: Mapped[int]
    subject: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(1000))
    type: Mapped[str] = mapped_column(String(32))
    pages: Mapped[int]
    level: Mapped[str] = mapped_column(String(80))
    topics: Mapped[list[str]] = mapped_column(JSON, default=list)
    file_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    display_name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = value.strip().casefold()
        if not re.fullmatch(r"[a-z0-9_.-]{3,32}", normalized):
            raise ValueError("Tên tài khoản chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.")
        return normalized

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Tên hiển thị phải có ít nhất 2 ký tự.")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password_characters(cls, value: str) -> str:
        if not value.isascii():
            raise ValueError("Mật khẩu chỉ được dùng ký tự không dấu.")
        return value


class LoginRequest(BaseModel):
    username: str
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().casefold()

    @field_validator("password")
    @classmethod
    def validate_password_characters(cls, value: str) -> str:
        if not value.isascii():
            raise ValueError("Mật khẩu chỉ được dùng ký tự không dấu.")
        return value


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str | None
    username: str | None
    display_name: str
    role: Role
    created_at: datetime


class CatalogInput(BaseModel):
    grade: int = Field(ge=10, le=12)
    subject: str = Field(min_length=2, max_length=64)
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=2, max_length=1000)
    level: str = Field(min_length=1, max_length=80)
    topics: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("subject")
    @classmethod
    def validate_subject(cls, value: str) -> str:
        normalized = value.strip()
        if normalized not in SUBJECT_NAMES:
            raise ValueError("Môn học không hợp lệ.")
        return normalized

    @field_validator("title", "description", "level")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Trường này không được để trống.")
        return normalized

    @field_validator("topics", mode="before")
    @classmethod
    def normalize_topics(cls, values: list[str] | str) -> list[str]:
        if isinstance(values, str):
            values = values.splitlines()
        if not isinstance(values, list):
            raise ValueError("Danh sách chủ đề không hợp lệ.")
        normalized = [topic.strip() for topic in values if topic.strip()]
        if any(len(topic) > 160 for topic in normalized):
            raise ValueError("Mỗi chủ đề không được vượt quá 160 ký tự.")
        return normalized


class CourseCreate(CatalogInput):
    lessons: int = Field(ge=1, le=500)


class MaterialCreate(CatalogInput):
    pages: int = Field(ge=1, le=10000)


class CatalogResponse(CatalogInput):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CourseResponse(CatalogResponse):
    lessons: int


class ExamResponse(CatalogResponse):
    file_key: str | None
    file_name: str | None


class MaterialResponse(CatalogResponse):
    type: str
    pages: int
    file_key: str | None
    file_name: str | None


def create_database_engine(database_url: str) -> Engine:
    options: dict[str, object] = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
        if database_url in {"sqlite://", "sqlite:///:memory:"}:
            options["poolclass"] = StaticPool
    return create_engine(database_url, **options)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def make_sqlite_email_nullable(engine: Engine) -> None:
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        try:
            with connection.begin():
                columns = [
                    Column(
                        column.name,
                        column.type,
                        primary_key=column.primary_key,
                        nullable=True if column.name == "email" else column.nullable,
                        autoincrement=column.autoincrement,
                    )
                    for column in User.__table__.columns
                ]
                replacement = Table("users_new", MetaData(), *columns)
                replacement.create(connection)
                column_names = ", ".join(f'"{column.name}"' for column in User.__table__.columns)
                connection.exec_driver_sql(
                    f"INSERT INTO users_new ({column_names}) SELECT {column_names} FROM users"
                )
                connection.exec_driver_sql("DROP TABLE users")
                connection.exec_driver_sql("ALTER TABLE users_new RENAME TO users")
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()


def initialize_database(engine: Engine) -> None:
    Base.metadata.create_all(engine)
    for table_name in ("exams", "materials"):
        columns = {column["name"] for column in inspect(engine).get_columns(table_name)}
        with engine.begin() as connection:
            if "file_key" not in columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE {table_name} ADD COLUMN file_key VARCHAR(64)"
                )
            if "file_name" not in columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE {table_name} ADD COLUMN file_name VARCHAR(255)"
                )
    user_columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "username" not in user_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(32)"))
            existing_users = connection.execute(
                text("SELECT id, email FROM users ORDER BY id")
            ).mappings()
            used_usernames: set[str] = set()
            for existing_user in existing_users:
                base = re.sub(r"[^a-z0-9_.-]", "", existing_user["email"].split("@", 1)[0].casefold())
                if len(base) < 3:
                    base = f"user{existing_user['id']}"
                base = base[:32].rstrip("._-") or f"user{existing_user['id']}"
                username = base
                suffix = 2
                while username in used_usernames:
                    ending = f"_{suffix}"
                    username = f"{base[:32 - len(ending)].rstrip('._-')}{ending}"
                    suffix += 1
                used_usernames.add(username)
                connection.execute(
                    text("UPDATE users SET username = :username WHERE id = :user_id"),
                    {"username": username, "user_id": existing_user["id"]},
                )

    email_column = next(column for column in inspect(engine).get_columns("users") if column["name"] == "email")
    if not email_column["nullable"]:
        if engine.dialect.name == "sqlite":
            make_sqlite_email_nullable(engine)
        elif engine.dialect.name == "postgresql":
            with engine.begin() as connection:
                connection.exec_driver_sql("ALTER TABLE users ALTER COLUMN email DROP NOT NULL")
        elif engine.dialect.name == "mysql":
            with engine.begin() as connection:
                connection.exec_driver_sql("ALTER TABLE users MODIFY COLUMN email VARCHAR(254) NULL")
        else:
            raise RuntimeError(
                f"Không hỗ trợ tự nâng cấp cột email cho database {engine.dialect.name}."
            )

    for index in User.__table__.indexes:
        index.create(engine, checkfirst=True)


async def store_catalog_file(file: UploadFile, upload_directory: Path) -> tuple[str, str, str, Path]:
    file_name = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    extension = Path(file_name).suffix.casefold()
    signature = ALLOWED_FILE_SIGNATURES.get(extension)
    if not file_name or len(file_name) > 255 or signature is None:
        raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Chỉ chấp nhận tệp PDF, DOC hoặc DOCX.",
        )

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail="Tệp tải lên không được vượt quá 20 MB.",
        )
    if not content.startswith(signature):
        raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Định dạng tệp không khớp với phần mở rộng.",
        )

    file_key = f"{uuid.uuid4().hex}{extension}"
    upload_directory.mkdir(parents=True, exist_ok=True)
    file_path = upload_directory / file_key
    file_path.write_bytes(content)
    return file_key, file_name, extension[1:].upper(), file_path


def remove_catalog_file(file_key: str | None, upload_directory: Path) -> None:
    if file_key is None:
        return
    if not re.fullmatch(r"[a-f0-9]{32}\.(?:pdf|doc|docx)", file_key):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể xóa tệp đính kèm vì đường dẫn không hợp lệ.",
        )
    try:
        (upload_directory / file_key).unlink(missing_ok=True)
    except OSError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Đã xóa nội dung nhưng không thể xóa tệp đính kèm.",
        ) from error


def find_libreoffice_executable() -> str | None:
    configured_path = os.getenv("LIBREOFFICE_PATH", "").strip()
    if configured_path:
        return configured_path if Path(configured_path).is_file() else None

    executable = shutil.which("soffice") or shutil.which("soffice.exe")
    if executable:
        return executable

    for program_directory in (os.getenv("ProgramFiles"), os.getenv("ProgramFiles(x86)")):
        if program_directory:
            candidate = Path(program_directory) / "LibreOffice" / "program" / "soffice.exe"
            if candidate.is_file():
                return str(candidate)
    return None


def convert_doc_to_pdf(file_path: Path) -> bytes:
    executable = find_libreoffice_executable()
    if executable is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Chưa cài LibreOffice trên máy chủ. Hãy cài LibreOffice hoặc cấu hình "
                "LIBREOFFICE_PATH để xem tệp DOC."
            ),
        )

    with tempfile.TemporaryDirectory(prefix="hoc-cung-vui-doc-preview-") as temp_directory:
        temp_path = Path(temp_directory)
        output_path = temp_path / f"{file_path.stem}.pdf"
        profile_path = temp_path / "profile"
        command = [
            executable,
            f"-env:UserInstallation={profile_path.as_uri()}",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            str(temp_path),
            str(file_path),
        ]
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Chuyển đổi tệp DOC quá thời gian cho phép.",
            ) from error
        except OSError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Không thể khởi động LibreOffice để chuyển đổi tệp DOC.",
            ) from error

        if result.returncode != 0 or not output_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Không thể chuyển đổi tệp DOC. Hãy kiểm tra tệp có hợp lệ không.",
            )

        pdf_content = output_path.read_bytes()
        if not pdf_content.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="LibreOffice không tạo được tệp PDF xem trước hợp lệ.",
            )
        return pdf_content


def parse_catalog_payload(payload_json: str, schema: type[CatalogInput]) -> CatalogInput:
    try:
        return schema.model_validate_json(payload_json)
    except ValidationError as error:
        details = [
            {**item, "loc": ("body", "payload", *item["loc"])}
            for item in error.errors()
        ]
        raise RequestValidationError(details) from error


def create_app(
    database_url: str | None = None,
    upload_directory: str | Path | None = None,
) -> FastAPI:
    configured_url = database_url if database_url is not None else os.getenv("DATABASE_URL", "").strip()
    configured_upload_directory = (
        Path(upload_directory)
        if upload_directory is not None
        else Path(
        os.getenv("UPLOADS_DIR", "").strip()
        or PROJECT_ROOT.parent / f".{PROJECT_ROOT.name}-uploads"
        )
    ).resolve()
    cookie_secure = os.getenv("COOKIE_SECURE", "false").strip().casefold() == "true"
    allowed_origins = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    ]

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if not configured_url:
            raise RuntimeError(
                "DATABASE_URL đang để trống. Hãy điền chuỗi kết nối trong API/.env "
                "theo mẫu API/.env.example rồi khởi động lại."
            )
        engine = create_database_engine(configured_url)
        initialize_database(engine)
        app.state.engine = engine
        app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="Học Cùng Vui API", version="1.0.0", lifespan=lifespan)
    app.state.upload_directory = configured_upload_directory
    if allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"],
        )

    @app.middleware("http")
    async def require_login_for_learning_pages(request: Request, call_next):
        if request.url.path in PROTECTED_PAGE_PATHS:
            token = request.cookies.get(SESSION_COOKIE)
            authenticated = False
            if token:
                with request.app.state.session_factory() as db:
                    login_session = db.get(UserSession, token_digest(token))
                    if login_session is not None:
                        expires_at = login_session.expires_at
                        if expires_at.tzinfo is None:
                            expires_at = expires_at.replace(tzinfo=timezone.utc)
                        if expires_at > datetime.now(timezone.utc):
                            authenticated = db.get(User, login_session.user_id) is not None
                        else:
                            db.delete(login_session)
                            db.commit()
            if not authenticated:
                return RedirectResponse("/html/tai_khoan.html", status_code=status.HTTP_303_SEE_OTHER)
        return await call_next(request)

    def get_db(request: Request):
        with request.app.state.session_factory() as db:
            yield db

    def get_current_user(
        request: Request,
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        token = request.cookies.get(SESSION_COOKIE)
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Vui lòng đăng nhập.")
        login_session = db.get(UserSession, token_digest(token))
        if login_session is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập không hợp lệ.")
        expires_at = login_session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            db.delete(login_session)
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập đã hết hạn.")
        user = db.get(User, login_session.user_id)
        if user is None:
            db.delete(login_session)
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tài khoản không còn tồn tại.")
        return user

    def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role != Role.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ admin mới được phép.",
            )
        return user

    @app.get("/api/health")
    def health_check():
        return {"status": "ok"}

    @app.post("/api/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
    def register(payload: RegisterRequest, db: Annotated[Session, Depends(get_db)]):
        if db.scalar(select(User.id).where(User.username == payload.username)) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên tài khoản này đã được sử dụng.")
        user = User(
            username=payload.username,
            display_name=payload.display_name,
            password_hash=PASSWORD_HASHER.hash(payload.password),
            role=Role.USER,
        )
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên tài khoản này đã được sử dụng.") from None
        db.refresh(user)
        return user

    @app.post("/api/auth/login", response_model=UserResponse)
    def login(payload: LoginRequest, response: Response, db: Annotated[Session, Depends(get_db)]):
        user = db.scalar(select(User).where(User.username == payload.username))
        if user is None or not PASSWORD_HASHER.verify(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tên tài khoản hoặc mật khẩu không đúng.")

        token = secrets.token_urlsafe(32)
        db.add(
            UserSession(
                token_hash=token_digest(token),
                user_id=user.id,
                expires_at=datetime.now(timezone.utc) + timedelta(seconds=SESSION_MAX_AGE_SECONDS),
            )
        )
        db.commit()
        response.set_cookie(
            key=SESSION_COOKIE,
            value=token,
            max_age=SESSION_MAX_AGE_SECONDS,
            httponly=True,
            secure=cookie_secure,
            samesite="lax",
            path="/",
        )
        return user

    @app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(
        request: Request,
        response: Response,
        db: Annotated[Session, Depends(get_db)],
    ):
        token = request.cookies.get(SESSION_COOKIE)
        if token:
            login_session = db.get(UserSession, token_digest(token))
            if login_session is not None:
                db.delete(login_session)
                db.commit()
        response.delete_cookie(
            key=SESSION_COOKIE,
            path="/",
            httponly=True,
            secure=cookie_secure,
            samesite="lax",
        )

    @app.get("/api/auth/me", response_model=UserResponse)
    def current_account(user: Annotated[User, Depends(get_current_user)]):
        return user

    @app.get("/api/catalog/courses", response_model=list[CourseResponse])
    def list_courses(
        _: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ):
        return list(db.scalars(select(LearningCourse).order_by(LearningCourse.id.desc())))

    @app.post(
        "/api/admin/courses",
        response_model=CourseResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_course(
        payload: CourseCreate,
        _: Annotated[User, Depends(require_admin)],
        db: Annotated[Session, Depends(get_db)],
    ):
        course = LearningCourse(**payload.model_dump())
        db.add(course)
        db.commit()
        db.refresh(course)
        return course

    @app.delete("/api/admin/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_course(
        course_id: int,
        _: Annotated[User, Depends(require_admin)],
        db: Annotated[Session, Depends(get_db)],
    ):
        course = db.get(LearningCourse, course_id)
        if course is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học.")
        db.delete(course)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/catalog/exams", response_model=list[ExamResponse])
    def list_exams(
        _: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ):
        return list(db.scalars(select(PracticeExam).order_by(PracticeExam.id.desc())))

    @app.post(
        "/api/admin/exams",
        response_model=ExamResponse,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_exam(
        payload_json: Annotated[str, Form(alias="payload")],
        file: Annotated[UploadFile, File()],
        _: Annotated[User, Depends(require_admin)],
        db: Annotated[Session, Depends(get_db)],
    ):
        payload = parse_catalog_payload(payload_json, CatalogInput)
        file_key, file_name, _, file_path = await store_catalog_file(
            file, app.state.upload_directory
        )
        exam = PracticeExam(
            **payload.model_dump(),
            file_key=file_key,
            file_name=file_name,
        )
        db.add(exam)
        try:
            db.commit()
            db.refresh(exam)
        except Exception:
            db.rollback()
            file_path.unlink(missing_ok=True)
            raise
        return exam

    @app.delete("/api/admin/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_exam(
        exam_id: int,
        _: Annotated[User, Depends(require_admin)],
        db: Annotated[Session, Depends(get_db)],
    ):
        exam = db.get(PracticeExam, exam_id)
        if exam is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đề luyện tập.")
        file_key = exam.file_key
        db.delete(exam)
        db.commit()
        remove_catalog_file(file_key, app.state.upload_directory)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/catalog/materials", response_model=list[MaterialResponse])
    def list_materials(
        _: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ):
        return list(db.scalars(select(StudyMaterial).order_by(StudyMaterial.id.desc())))

    @app.post(
        "/api/admin/materials",
        response_model=MaterialResponse,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_material(
        payload_json: Annotated[str, Form(alias="payload")],
        file: Annotated[UploadFile, File()],
        _: Annotated[User, Depends(require_admin)],
        db: Annotated[Session, Depends(get_db)],
    ):
        payload = parse_catalog_payload(payload_json, MaterialCreate)
        file_key, file_name, file_type, file_path = await store_catalog_file(
            file, app.state.upload_directory
        )
        material = StudyMaterial(
            **payload.model_dump(),
            type=file_type,
            file_key=file_key,
            file_name=file_name,
        )
        db.add(material)
        try:
            db.commit()
            db.refresh(material)
        except Exception:
            db.rollback()
            file_path.unlink(missing_ok=True)
            raise
        return material

    @app.delete("/api/admin/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_material(
        material_id: int,
        _: Annotated[User, Depends(require_admin)],
        db: Annotated[Session, Depends(get_db)],
    ):
        material = db.get(StudyMaterial, material_id)
        if material is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài liệu.")
        file_key = material.file_key
        db.delete(material)
        db.commit()
        remove_catalog_file(file_key, app.state.upload_directory)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/catalog/files/{file_key}")
    def download_catalog_file(
        file_key: str,
        _: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
        inline: bool = False,
    ):
        if not re.fullmatch(r"[a-f0-9]{32}\.(?:pdf|doc|docx)", file_key):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tệp.")
        file_name = db.scalar(
            select(PracticeExam.file_name).where(PracticeExam.file_key == file_key)
        )
        if file_name is None:
            file_name = db.scalar(
                select(StudyMaterial.file_name).where(StudyMaterial.file_key == file_key)
            )
        file_path = app.state.upload_directory / file_key
        if file_name is None or not file_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tệp.")
        media_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
        disposition = (
            "inline"
            if inline and Path(file_name).suffix.casefold() == ".pdf"
            else "attachment"
        )
        return FileResponse(
            file_path,
            media_type=media_type,
            filename=file_name,
            content_disposition_type=disposition,
        )

    @app.get("/api/catalog/files/{file_key}/preview")
    def preview_legacy_doc_file(
        file_key: str,
        _: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ):
        if not re.fullmatch(r"[a-f0-9]{32}\.doc", file_key):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tệp DOC.")

        file_name = db.scalar(
            select(PracticeExam.file_name).where(PracticeExam.file_key == file_key)
        )
        if file_name is None:
            file_name = db.scalar(
                select(StudyMaterial.file_name).where(StudyMaterial.file_key == file_key)
            )
        file_path = app.state.upload_directory / file_key
        if file_name is None or Path(file_name).suffix.casefold() != ".doc" or not file_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tệp DOC.")

        return Response(
            content=convert_doc_to_pdf(file_path),
            media_type="application/pdf",
            headers={"Content-Disposition": 'inline; filename="document-preview.pdf"'},
        )

    @app.get("/api/admin/users", response_model=list[UserResponse])
    def list_users(
        _: Annotated[User, Depends(require_admin)],
        db: Annotated[Session, Depends(get_db)],
    ):
        return list(db.scalars(select(User).order_by(User.id)))

    @app.get("/", include_in_schema=False)
    def home():
        return RedirectResponse("/html/index.html")

    app.mount("/", StaticFiles(directory=PROJECT_ROOT, html=True), name="frontend")
    return app


app = create_app()






