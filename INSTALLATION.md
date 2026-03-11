# Hướng Dẫn Cài Đặt English Center (Thủ Công)

Tài liệu này hướng dẫn chi tiết các bước cài đặt và chạy ứng dụng English Center NestJS API.

## 1. Yêu Cầu Hệ Thống (Prerequisites)

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt các công cụ sau:

-   **Node.js**: Phiên bản 18 trở lên.
    -   Kiểm tra: `node -v`
-   **npm**: Thường đi kèm với Node.js.
    -   Kiểm tra: `npm -v`
-   **PostgreSQL**: Phiên bản 17 trở lên.
    -   Kiểm tra: `psql --version` (nếu có cài tools dòng lệnh) hoặc kiểm tra qua pgAdmin.
-   **Redis**: Phiên bản 7 trở lên.
    -   Kiểm tra: `redis-cli ping` (response phải là `PONG`).
-   **Git**: Để clone source code.

## 2. Chuẩn Bị Môi Trường

### Bước 2.1: Copy file cấu hình
Tại thư mục gốc của dự án, tạo file `.env` bằng cách copy từ file mẫu `.env.example`.

**Lệnh (Terminal):**
```bash
cp .env.example .env
```
*(Hoặc copy thủ công trong File Explorer)*

### Bước 2.2: Cấu hình biến môi trường
Mở file `.env` vừa tạo và cập nhật các thông số quan trọng sau cho phù hợp với máy của bạn:

**Cấu hình Database (PostgreSQL):**
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres      <-- Thay bằng user của bạn (mặc định thường là postgres)
DATABASE_PASSWORD=your_password <-- Thay bằng mật khẩu DB của bạn
DATABASE_NAME=eng-center        <-- Tên database bạn muốn dùng
```

**Cấu hình Redis:**
```env
REDIS_HOST=localhost
REDIS_PORT=6379
# Nếu Redis có pass thì điền vào, không thì để trống hoặc comment lại
REDIS_PASSWORD=
```

**Mật khẩu JWT (Quan trọng):**
Bạn nên thay đổi các chuỗi bí mật này để bảo mật hơn (gõ ngẫu nhiên cũng được).
```env
JWT_ACCESS_SECRET=thay_doi_chuoi_nay
JWT_REFRESH_SECRET=thay_doi_chuoi_nay_nua
```

## 3. Cài Đặt Thư Viện (Dependencies)

Chạy lệnh sau để tải về các thư viện cần thiết cho dự án:

```bash
npm install
```
*Quá trình này có thể mất vài phút tùy tốc độ mạng.*

## 4. Khởi Tạo Database

### Bước 4.1: Tạo Database
Bạn cần tạo một database trống tên là `eng-center` (hoặc tên bạn đã cấu hình trong `.env`) trong PostgreSQL.
Có thể dùng pgAdmin hoặc lệnh SQL:
```sql
CREATE DATABASE "eng-center";
```

### Bước 4.2: Chạy Migrations & Seeds
Lệnh này sẽ tạo các bảng (tables) và dữ liệu mẫu (admin, roles, permissions...) vào database.

```bash
npm run seed
```
*Lưu ý: Nếu gặp lỗi kết nối, hãy kiểm tra lại username/password trong file `.env`.*

## 5. Chạy Ứng Dụng

Sau khi cài đặt xong, bạn có thể chạy ứng dụng.

**Chế độ phát triển (Development):**
Tự động restart khi sửa code.
```bash
npm run start:dev
```

**Chế độ sản phẩm (Production):**
Chạy ổn định hơn, cần build trước.
```bash
npm run build
npm run start:prod
```

## 6. Kiểm Tra Hoạt Động

Mặc định ứng dụng sẽ chạy tại cổng `8080` (hoặc cổng trong `APP_PORT` file `.env`).

-   **API Base URL**: `http://localhost:8080/api/v1`
-   **Thử truy cập**: `http://localhost:8080/api/v1/health` (hoặc endpoint công khai nào đó nếu có)
-   **Tài liệu API (Swagger - nếu có)**: Thường ở `http://localhost:8080/api/docs` (cần kiểm tra lại trong code nếu có cấu hình Swagger).
