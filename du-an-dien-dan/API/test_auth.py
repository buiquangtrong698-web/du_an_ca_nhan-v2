import json
import unittest
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from API.main import LearningCourse, PracticeExam, Role, StudyMaterial, User, create_app, initialize_database


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.cookie_secure_patch = patch.dict("os.environ", {"COOKIE_SECURE": "false"})
        self.cookie_secure_patch.start()
        self.upload_temp = tempfile.TemporaryDirectory()
        self.upload_directory = Path(self.upload_temp.name)
        self.client = TestClient(create_app("sqlite://", self.upload_directory))
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.upload_temp.cleanup()
        self.cookie_secure_patch.stop()

    def register(self, username="student", **overrides):
        payload = {
            "username": username,
            "display_name": "Học sinh",
            "password": "secure-pass-123",
            **overrides,
        }
        return self.client.post("/api/auth/register", json=payload)

    def promote_user_to_admin(self, username="student"):
        with self.client.app.state.session_factory() as db:
            user = db.query(User).filter_by(username=username).one()
            user.role = Role.ADMIN
            db.commit()

    @staticmethod
    def upload_form(payload):
        return {"payload": json.dumps(payload)}

    def test_database_url_is_required_at_startup(self):
        with self.assertRaisesRegex(RuntimeError, "DATABASE_URL"):
            with TestClient(create_app("")):
                pass

    def test_registration_always_assigns_user_role(self):
        response = self.register(role="admin")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["role"], "user")
        self.assertIsNone(response.json()["email"])
        self.assertNotIn("password_hash", response.json())
        with self.client.app.state.session_factory() as db:
            user = db.query(User).filter_by(username="student").one()
            self.assertEqual(user.display_name, "Học sinh")
            self.assertEqual(user.role, Role.USER)
            self.assertNotEqual(user.password_hash, "secure-pass-123")

    def test_registration_does_not_require_email(self):
        response = self.register()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["username"], "student")

    def test_duplicate_username_is_rejected_case_insensitively(self):
        self.assertEqual(self.register().status_code, 201)

        duplicate = self.register(username="STUDENT")

        self.assertEqual(duplicate.status_code, 409)

    def test_registration_rejects_accented_username_or_password(self):
        accented_username = self.register(username="minhánh")
        accented_password = self.register(username="other", password="mậtkhẩu123")

        self.assertEqual(accented_username.status_code, 422)
        self.assertEqual(accented_password.status_code, 422)

    def test_login_session_and_logout(self):
        self.register()
        self.assertEqual(self.client.get("/html/index.html", follow_redirects=False).status_code, 303)
        self.assertEqual(self.client.get("/", follow_redirects=False).status_code, 303)
        email_login = self.client.post(
            "/api/auth/login",
            json={"email": "student@example.com", "password": "secure-pass-123"},
        )
        self.assertEqual(email_login.status_code, 422)
        accented_password_login = self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "mậtkhẩu123"},
        )
        self.assertEqual(accented_password_login.status_code, 422)
        login = self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json()["username"], "student")
        self.assertTrue(login.headers["set-cookie"].lower().find("httponly") >= 0)
        self.assertEqual(self.client.get("/api/auth/me").json()["username"], "student")
        self.assertEqual(self.client.get("/html/index.html", follow_redirects=False).status_code, 200)
        self.assertEqual(self.client.get("/html/dien_dan.html", follow_redirects=False).status_code, 200)
        self.assertEqual(self.client.get("/", follow_redirects=False).headers["location"], "/html/index.html")

        logout = self.client.post("/api/auth/logout")

        self.assertEqual(logout.status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        self.assertEqual(self.client.get("/html/index.html", follow_redirects=False).status_code, 303)

    def test_admin_route_denies_user_role(self):
        self.register()
        self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )

        response = self.client.get("/api/admin/users")

        self.assertEqual(response.status_code, 403)
        with self.client.app.state.session_factory() as db:
            user = db.query(User).filter_by(username="student").one()
            self.assertEqual(user.role, Role.USER)

    def test_user_cannot_create_course(self):
        self.register()
        self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )

        response = self.client.post(
            "/api/admin/courses",
            json={
                "grade": 12,
                "subject": "Toán",
                "title": "Khóa học không được phép",
                "description": "Thử quyền user",
                "lessons": 10,
                "level": "Cơ bản",
            },
        )

        self.assertEqual(response.status_code, 403)
        with self.client.app.state.session_factory() as db:
            self.assertEqual(db.query(LearningCourse).count(), 0)

    def test_admin_can_create_course_and_course_is_listed(self):
        self.register()
        self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )
        with self.client.app.state.session_factory() as db:
            user = db.query(User).filter_by(username="student").one()
            user.role = Role.ADMIN
            db.commit()

        response = self.client.post(
            "/api/admin/courses",
            json={
                "grade": 12,
                "subject": "Toán",
                "title": "Đại số căn bản",
                "description": "Khóa học kiểm thử",
                "lessons": 10,
                "level": "Cơ bản",
                "topics": ["Hàm số", "Phương trình"],
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["title"], "Đại số căn bản")
        self.assertEqual(
            self.client.get("/api/catalog/courses").json()[0]["title"],
            "Đại số căn bản",
        )
        with self.client.app.state.session_factory() as db:
            self.assertEqual(db.query(LearningCourse).count(), 1)

    def test_user_cannot_delete_course_exam_or_material(self):
        self.register()
        self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )
        with self.client.app.state.session_factory() as db:
            course = LearningCourse(
                grade=12,
                subject="Toán",
                title="Khóa học",
                description="Kiểm tra quyền",
                lessons=10,
                level="Cơ bản",
                topics=[],
            )
            exam = PracticeExam(
                grade=12,
                subject="Toán",
                title="Đề luyện tập",
                description="Kiểm tra quyền",
                level="Cơ bản",
                topics=[],
            )
            material = StudyMaterial(
                grade=12,
                subject="Toán",
                title="Tài liệu",
                description="Kiểm tra quyền",
                type="PDF",
                pages=2,
                level="Cơ bản",
                topics=[],
            )
            db.add_all([course, exam, material])
            db.commit()
            ids = (course.id, exam.id, material.id)

        responses = [
            self.client.delete(f"/api/admin/courses/{ids[0]}"),
            self.client.delete(f"/api/admin/exams/{ids[1]}"),
            self.client.delete(f"/api/admin/materials/{ids[2]}"),
        ]

        self.assertEqual([response.status_code for response in responses], [403, 403, 403])
        with self.client.app.state.session_factory() as db:
            self.assertEqual(db.query(LearningCourse).count(), 1)
            self.assertEqual(db.query(PracticeExam).count(), 1)
            self.assertEqual(db.query(StudyMaterial).count(), 1)

    def test_admin_can_delete_catalog_entries_and_attached_files(self):
        self.register()
        self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )
        self.promote_user_to_admin()

        exam_key = "a" * 32 + ".pdf"
        material_key = "b" * 32 + ".docx"
        self.upload_directory.mkdir(parents=True, exist_ok=True)
        (self.upload_directory / exam_key).write_bytes(b"%PDF-1.7\n")
        (self.upload_directory / material_key).write_bytes(b"PK\x03\x04")
        with self.client.app.state.session_factory() as db:
            course = LearningCourse(
                grade=12,
                subject="Toán",
                title="Khóa học xóa",
                description="Kiểm tra xóa",
                lessons=10,
                level="Cơ bản",
                topics=[],
            )
            exam = PracticeExam(
                grade=12,
                subject="Toán",
                title="Đề xóa",
                description="Kiểm tra xóa",
                level="Cơ bản",
                topics=[],
                file_key=exam_key,
                file_name="de.pdf",
            )
            material = StudyMaterial(
                grade=12,
                subject="Toán",
                title="Tài liệu xóa",
                description="Kiểm tra xóa",
                type="DOCX",
                pages=2,
                level="Cơ bản",
                topics=[],
                file_key=material_key,
                file_name="tai-lieu.docx",
            )
            db.add_all([course, exam, material])
            db.commit()
            ids = (course.id, exam.id, material.id)

        responses = [
            self.client.delete(f"/api/admin/courses/{ids[0]}"),
            self.client.delete(f"/api/admin/exams/{ids[1]}"),
            self.client.delete(f"/api/admin/materials/{ids[2]}"),
        ]

        self.assertEqual([response.status_code for response in responses], [204, 204, 204])
        self.assertEqual(self.client.get("/api/catalog/courses").json(), [])
        self.assertEqual(self.client.get("/api/catalog/exams").json(), [])
        self.assertEqual(self.client.get("/api/catalog/materials").json(), [])
        self.assertFalse((self.upload_directory / exam_key).exists())
        self.assertFalse((self.upload_directory / material_key).exists())
        self.assertEqual(self.client.delete(f"/api/admin/courses/{ids[0]}").status_code, 404)

    def test_user_cannot_create_exam_or_material(self):
        self.register()
        self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )

        exam = self.client.post(
            "/api/admin/exams",
            data=self.upload_form({
                "grade": 12,
                "subject": "Toán",
                "title": "Đề không được phép",
                "description": "Thử quyền user",
                "level": "Cơ bản",
            }),
            files={"file": ("de.pdf", b"%PDF-1.7\n", "application/pdf")},
        )
        material = self.client.post(
            "/api/admin/materials",
            data=self.upload_form({
                "grade": 12,
                "subject": "Toán",
                "title": "Tài liệu không được phép",
                "description": "Thử quyền user",
                "pages": 5,
                "level": "Cơ bản",
            }),
            files={"file": ("tailieu.pdf", b"%PDF-1.7\n", "application/pdf")},
        )

        self.assertEqual(exam.status_code, 403)
        self.assertEqual(material.status_code, 403)
        with self.client.app.state.session_factory() as db:
            self.assertEqual(db.query(PracticeExam).count(), 0)
            self.assertEqual(db.query(StudyMaterial).count(), 0)

    def test_admin_can_create_exams_and_materials(self):
        self.register()
        self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )
        with self.client.app.state.session_factory() as db:
            user = db.query(User).filter_by(username="student").one()
            user.role = Role.ADMIN
            db.commit()

        exam = self.client.post(
            "/api/admin/exams",
            data=self.upload_form({
                "grade": 12,
                "subject": "Toán",
                "title": "Đề hàm số",
                "description": "Đề luyện tập hàm số",
                "level": "Cơ bản",
                "topics": ["Đạo hàm", "Hàm số"],
            }),
            files={"file": ("de-ham-so.pdf", b"%PDF-1.7\nDe luyen tap", "application/pdf")},
        )
        material = self.client.post(
            "/api/admin/materials",
            data=self.upload_form({
                "grade": 12,
                "subject": "Toán",
                "title": "Tài liệu hàm số",
                "description": "Tài liệu ôn tập hàm số",
                "pages": 5,
                "level": "Cơ bản",
                "topics": ["Đạo hàm", "Hàm số"],
            }),
            files={
                "file": (
                    "tai-lieu-ham-so.docx",
                    b"PK\x03\x04Word document",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )

        self.assertEqual(exam.status_code, 201, exam.text)
        self.assertEqual(material.status_code, 201, material.text)
        self.assertNotIn("questions", exam.json())
        self.assertNotIn("duration", exam.json())
        self.assertEqual(material.json()["type"], "DOCX")
        self.assertEqual(self.client.get("/api/catalog/exams").json()[0]["title"], "Đề hàm số")
        self.assertEqual(self.client.get("/api/catalog/materials").json()[0]["title"], "Tài liệu hàm số")
        exam_download = self.client.get(f"/api/catalog/files/{exam.json()['file_key']}")
        exam_preview = self.client.get(f"/api/catalog/files/{exam.json()['file_key']}?inline=true")
        material_download = self.client.get(f"/api/catalog/files/{material.json()['file_key']}")
        material_preview = self.client.get(
            f"/api/catalog/files/{material.json()['file_key']}?inline=true"
        )
        self.assertEqual(exam_download.content, b"%PDF-1.7\nDe luyen tap")
        self.assertTrue(exam_download.headers["content-disposition"].startswith("attachment;"))
        self.assertTrue(exam_preview.headers["content-disposition"].startswith("inline;"))
        self.assertEqual(material_download.content, b"PK\x03\x04Word document")
        self.assertTrue(material_preview.headers["content-disposition"].startswith("attachment;"))
        self.client.post("/api/auth/logout")
        self.assertEqual(
            self.client.get(f"/api/catalog/files/{exam.json()['file_key']}").status_code,
            401,
        )
        with self.client.app.state.session_factory() as db:
            self.assertEqual(db.query(PracticeExam).count(), 1)
            self.assertEqual(db.query(StudyMaterial).count(), 1)

    def test_admin_can_upload_doc_and_invalid_files_are_rejected(self):
        self.register()
        self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )
        self.promote_user_to_admin()

        exam_data = {
            "grade": 12,
            "subject": "Toán",
            "title": "Đề Word",
            "description": "Tệp DOC",
            "level": "Cơ bản",
        }
        doc = self.client.post(
            "/api/admin/exams",
            data=self.upload_form(exam_data),
            files={"file": ("de.doc", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1Word", "application/msword")},
        )
        unsupported = self.client.post(
            "/api/admin/exams",
            data=self.upload_form({**exam_data, "title": "Tệp sai định dạng"}),
            files={"file": ("de.txt", b"not a document", "text/plain")},
        )
        mismatched = self.client.post(
            "/api/admin/exams",
            data=self.upload_form({**exam_data, "title": "Tệp giả PDF"}),
            files={"file": ("de.pdf", b"not a PDF", "application/pdf")},
        )

        self.assertEqual(doc.status_code, 201, doc.text)
        self.assertTrue(doc.json()["file_key"].endswith(".doc"))
        self.assertEqual(unsupported.status_code, 400)
        self.assertEqual(mismatched.status_code, 400)
        self.assertEqual(self.client.get(f"/api/catalog/files/{doc.json()['file_key']}").content,
                         b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1Word")

    def test_doc_preview_converts_to_inline_pdf_and_reports_missing_converter(self):
        self.register()
        self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )
        self.promote_user_to_admin()
        material = self.client.post(
            "/api/admin/materials",
            data=self.upload_form({
                "grade": 12,
                "subject": "Toán",
                "title": "Tài liệu DOC",
                "description": "Kiểm tra xem DOC",
                "pages": 1,
                "level": "Cơ bản",
                "topics": [],
            }),
            files={
                "file": (
                    "tai-lieu.doc",
                    b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1Word document",
                    "application/msword",
                )
            },
        )
        self.assertEqual(material.status_code, 201, material.text)

        def fake_libreoffice(command, **_):
            output_directory = Path(command[command.index("--outdir") + 1])
            source = Path(command[-1])
            (output_directory / f"{source.stem}.pdf").write_bytes(b"%PDF-1.7\nConverted DOC")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        file_key = material.json()["file_key"]
        with (
            patch("API.main.find_libreoffice_executable", return_value="soffice"),
            patch("API.main.subprocess.run", side_effect=fake_libreoffice),
        ):
            preview = self.client.get(f"/api/catalog/files/{file_key}/preview")

        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertTrue(preview.headers["content-type"].startswith("application/pdf"))
        self.assertTrue(preview.headers["content-disposition"].startswith("inline;"))
        self.assertEqual(preview.content, b"%PDF-1.7\nConverted DOC")

        with patch("API.main.find_libreoffice_executable", return_value=None):
            unavailable = self.client.get(f"/api/catalog/files/{file_key}/preview")
        self.assertEqual(unavailable.status_code, 503)
        self.assertIn("LibreOffice", unavailable.json()["detail"])

    def test_existing_exam_and_material_tables_are_upgraded_for_files(self):
        engine = create_engine("sqlite://")
        try:
            with engine.begin() as connection:
                connection.exec_driver_sql(
                    "CREATE TABLE exams (id INTEGER PRIMARY KEY, grade INTEGER NOT NULL, "
                    "subject VARCHAR(64) NOT NULL, title VARCHAR(160) NOT NULL, "
                    "description VARCHAR(1000) NOT NULL, questions INTEGER NOT NULL, "
                    "duration INTEGER NOT NULL, level VARCHAR(80) NOT NULL, topics JSON NOT NULL)"
                )
                connection.exec_driver_sql(
                    "CREATE TABLE materials (id INTEGER PRIMARY KEY, grade INTEGER NOT NULL, "
                    "subject VARCHAR(64) NOT NULL, title VARCHAR(160) NOT NULL, "
                    "description VARCHAR(1000) NOT NULL, type VARCHAR(32) NOT NULL, "
                    "pages INTEGER NOT NULL, level VARCHAR(80) NOT NULL, topics JSON NOT NULL)"
                )

            initialize_database(engine)

            with sessionmaker(bind=engine)() as db:
                db.add(PracticeExam(
                    grade=12,
                    subject="Toán",
                    title="Đề sau nâng cấp",
                    description="Kiểm tra cột legacy",
                    level="Cơ bản",
                    topics=[],
                ))
                db.commit()
            exam_columns = {column["name"] for column in inspect(engine).get_columns("exams")}
            material_columns = {column["name"] for column in inspect(engine).get_columns("materials")}
            self.assertTrue({"file_key", "file_name", "questions", "duration"} <= exam_columns)
            self.assertTrue({"file_key", "file_name"} <= material_columns)
        finally:
            engine.dispose()

    def test_promoted_admin_can_access_admin_route(self):
        self.register()
        self.client.post(
            "/api/auth/login",
            json={"username": "student", "password": "secure-pass-123"},
        )
        with self.client.app.state.session_factory() as db:
            user = db.query(User).filter_by(username="student").one()
            user.role = Role.ADMIN
            db.commit()

        response = self.client.get("/api/admin/users")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["role"], "admin")

    def test_existing_database_users_receive_unique_usernames(self):
        engine = create_engine("sqlite://")
        try:
            with engine.begin() as connection:
                connection.execute(text(
                    "CREATE TABLE users ("
                    "id INTEGER PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, "
                    "display_name VARCHAR(80) NOT NULL, password_hash VARCHAR(512) NOT NULL, "
                    "role VARCHAR(16) NOT NULL, created_at DATETIME NOT NULL)"
                ))
                connection.execute(text(
                    "INSERT INTO users (id, email, display_name, password_hash, role, created_at) "
                    "VALUES (1, 'student@example.com', 'Student', 'hash', 'user', CURRENT_TIMESTAMP), "
                    "(2, 'STUDENT@example.org', 'Student 2', 'hash', 'user', CURRENT_TIMESTAMP), "
                    "(3, 'a@example.org', 'Student 3', 'hash', 'user', CURRENT_TIMESTAMP)"
                ))

            initialize_database(engine)

            with engine.connect() as connection:
                usernames = connection.execute(
                    text("SELECT username FROM users ORDER BY id")
                ).scalars().all()
                email_column = next(
                    column for column in inspect(engine).get_columns("users")
                    if column["name"] == "email"
                )
            self.assertEqual(usernames, ["student", "student_2", "user3"])
            self.assertTrue(email_column["nullable"])
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
