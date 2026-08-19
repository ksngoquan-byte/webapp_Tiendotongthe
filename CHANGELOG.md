# Changelog

## [Unreleased]

### Added

- Luồng đăng ký có kiểm soát từ `USERS_SOFTWARE`, liên kết duy nhất theo `EmpCode` và chống ghi trùng bằng script lock.
- Regression test cho xác minh Firebase ID token, chuẩn hóa tên tiếng Việt, dữ liệu trùng/không hoạt động và đăng ký idempotent.
- Delegated `UPDATE_PROGRESS` theo `Email + ProjectCode + DeptCode` với kiểm tra backend fail-closed.
- Schema check và dry-run cho `User_Project_Dept_Access`; chưa apply Central Data live.
- Scope đọc/ghi BQLDA dự án `37-5.HL1` cho tài khoản được ủy quyền, không đổi phòng ban gốc.
- Whitelist tiến độ cho MASTER, `PB_DETAIL`, weekly task update, lưu nháp và gửi báo cáo tuần.
- Audit log phân biệt `HOME_DEPT`, `DELEGATED_ACCESS` và người thao tác thực tế.
- Regression test cho thời hạn, scope, field whitelist, thiếu sheet, báo cáo tuần và các action bị cấm.

### Fixed

- Gantt khóa biên thời gian theo tập công việc đang hiển thị và mức Zoom, tránh tự thêm một đơn vị scale rỗng trước/sau dữ liệu; với Zoom Năm, dự án bắt đầu năm 2026 không còn hiển thị năm 2025.
- Gantt không còn hiện tooltip lớn trên vùng timeline; thông tin xem nhanh chỉ xuất hiện khi rê vào tên công việc và chỉ gồm dữ liệu thực thi có giá trị. Công việc liên kết được resolve sang tên/nội dung công việc, không hiển thị ID/Ref kỹ thuật.

### Security

- Role, Phòng/Ban và tên hiển thị khi tự đăng ký được suy ra hoàn toàn từ nguồn nhân sự; payload client không còn quyết định quyền.
- Tra cứu tài khoản và nhân sự fail-closed khi trùng dữ liệu, sai cấu hình hoặc thiếu sheet; lỗi API dùng mã ổn định và không trả chi tiết nội bộ.
- Email client được ghi đè bằng identity đã xác minh từ Firebase ID token trước kiểm tra quyền.
- Delegated payload có trường ngoài whitelist bị từ chối toàn bộ bằng `DELEGATED_PROGRESS_FIELDS_FORBIDDEN`.
- Delegated weekly update không đọc/ghi hoặc hiển thị dữ liệu ngân sách.

## [1.0.0-internal] - 2026-07-02

### Phát hành nội bộ

- Quản lý dự án.
- WBS và công việc nhiều cấp.
- Gantt, tiến độ và phụ thuộc.
- Dashboard dự án và Dashboard phòng/ban.
- Mốc chính.
- Công việc phòng/ban và công việc chi tiết `PB_DETAIL`.
- Báo cáo tuần.
- Ngân sách.
- Phân quyền và đăng ký người dùng.
- Thông báo.
- Xuất Excel/PNG.
- Firebase Hosting.
- Apps Script API.
- Google Sheets mapping.