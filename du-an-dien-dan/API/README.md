# Tài khoản FastAPI

## Cấu hình database

1. Sao chép `API/.env.example` thành `API/.env`.
2. Điền `DATABASE_URL` bằng chuỗi kết nối SQLAlchemy của bạn. Ví dụ PostgreSQL:

   ```text
   DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/database_name
   ```

   Server chủ ý không khởi động khi giá trị này còn trống. Không commit file `API/.env`.

## Chạy ứng dụng

Từ thư mục gốc dự án:

```powershell
python -m pip install -r API/requirements.txt
python -m uvicorn API.main:app --reload
```

Mở `http://127.0.0.1:8000/` để dùng giao diện, hoặc `http://127.0.0.1:8000/docs` để xem API.
Trang chủ và các trang học tập chỉ truy cập được sau khi đăng nhập; khách chưa đăng nhập sẽ được chuyển tới trang đăng nhập.
Đăng ký cần tên tài khoản, tên hiển thị và mật khẩu; đăng nhập sử dụng tên tài khoản cùng mật khẩu. Tên tài khoản và mật khẩu chỉ chấp nhận ký tự không dấu (ASCII).

## Vai trò admin

Đăng ký tài khoản trước, sau đó chạy lệnh cục bộ từ thư mục gốc để cấp vai trò admin:

```powershell
python -m API.manage_users promote-admin ten_tai_khoan
```

Đổi lại thành user bằng `promote-user`. Đăng ký công khai luôn tạo tài khoản `user`; API không nhận vai trò từ dữ liệu đăng ký.

Phiên đăng nhập dùng cookie `HttpOnly`, hết hạn sau 7 ngày và bị thu hồi khi đăng xuất. Khi triển khai HTTPS, đặt `COOKIE_SECURE=true` trong `API/.env`.
