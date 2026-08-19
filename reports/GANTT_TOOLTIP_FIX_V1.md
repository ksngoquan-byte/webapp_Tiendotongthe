# Gantt execution tooltip patch v1

Mục tiêu: loại bỏ tooltip lớn khỏi vùng timeline Gantt và chỉ giữ thông tin thực thi ngắn gọn tại tên công việc.

Phạm vi UI đã chốt:
- Không lặp WBS, mã công việc, chủ trì, Zone/Hạng mục/Context và ngày kế hoạch trong tooltip vận hành.
- Thông tin cần xem nhanh: Trạng thái; Bắt đầu thực tế; Hoàn thành thực tế; Công việc liên kết; Ghi chú cập nhật.
- Trường không có dữ liệu thì không hiển thị.
- Công việc liên kết phải hiển thị nội dung/tên công việc, không hiển thị ID/Ref kỹ thuật.
- Không làm thay đổi engine tiến độ, dependency, baseline, dữ liệu Google Sheets hoặc Apps Script backend.
- Chế độ so sánh baseline phải giữ nguyên thông tin kế hoạch gốc cần thiết.

Branch: `fix/gantt-execution-tooltip-v1`
Base: `codex/perf-minimum-critical-boot`
