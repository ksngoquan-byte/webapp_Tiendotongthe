# AUDIT CRITICAL PATH — LẬP & CẬP NHẬT CÔNG VIỆC V1

## 1. Phạm vi và nguyên tắc

- Branch nguồn: `codex/restorable-operational-views-v2`.
- Audit tĩnh, chỉ đọc code; chưa thay đổi Apps Script, Google Sheets, schema, trigger hoặc deployment.
- Mục tiêu: xác định các thao tác nằm trên critical path khi người dùng mở màn hình **Lập & cập nhật công việc**, trước khi quyết định tách API hoặc refactor.
- Source of truth vận hành vẫn là Apps Script + Google Sheets; kết luận về thời gian thực tế cần được xác nhận bằng số đo trên DEV.

## 2. Call graph hiện tại

### 2.1. Khởi động màn hình

```text
renderApp
  -> resolveInitialViewForUser
  -> renderProjectOptions
  -> activeView === report
  -> loadDeptPlansForSelectedProject(projectCode)
  -> GET listDeptPlans?projectCode=...
  -> qltdDevApiListDeptPlans_
  -> qltdDeptPlanListForProject_
```

### 2.2. Sau khi người dùng mở khu vực cập nhật tuần

```text
loadWeeklyTaskDataForCurrent
  -> loadWeeklyTaskData
  -> Promise.all
       1. work_listweeklyitems
       2. weekly_taskupdates_get
```

Frontend đã có request sequence để bỏ qua response cũ khi đổi dự án nhanh. Weekly cũng đã có cache/in-flight map theo khóa project + dept + week.

## 3. Phát hiện chính

### F01 — Admin/PMO tải toàn bộ phòng/ban ngay khi mở màn hình

Frontend gọi `listDeptPlans` chỉ với `projectCode`, không truyền `deptCode` trong lần tải đầu. Backend cho phép `deptCode`, nhưng khi không có giá trị và người dùng có admin scope, `qltdDeptPlanListForProject_` lấy toàn bộ phòng/ban được mapping.

**Tác động:** chi phí khởi động tăng theo số phòng/ban và kích thước từng sheet, dù người dùng chỉ xem một phòng/ban.

**Mức độ:** Critical.

### F02 — Màn hình Report phụ thuộc vào việc dựng dữ liệu Gantt backend

`qltdDeptPlanListForProject_` luôn gọi `qltdDeptPlanBuildMasterContextMap_`. Hàm này gọi `qltdGanttGetDataForProject_(projectCode)` để tạo context cho MASTER.

**Tác động:** mở màn hình Lập & cập nhật công việc vẫn có thể phải đọc/dựng dữ liệu Cong_viec/Gantt ở backend. Điều này làm mất tính độc lập giữa màn hình tác nghiệp và Gantt.

**Mức độ:** Critical.

### F03 — Mỗi lần listDeptPlans đọc toàn bộ WEEKLY_TASK_UPDATES rồi mới lọc

`qltdDeptPlanReadWeeklyProgressStateMap_` gọi `qltdWeeklyTaskUpdatesRead_()`. Hàm đọc weekly sử dụng `getRange(...).getValues()` cho toàn bộ các dòng của sheet `WEEKLY_TASK_UPDATES`.

**Tác động:** thời gian listDeptPlans tăng theo tổng số cập nhật tuần của toàn hệ thống, không chỉ dự án/phòng/ban đang xem.

**Mức độ:** High; rủi ro tăng dần theo thời gian vận hành.

### F04 — Mỗi sheet phòng/ban được đọc toàn bộ vùng dữ liệu

`qltdDeptPlanParseSheet_` lấy `lastRow`, `lastColumn` rồi đọc toàn bộ `getRange(1, 1, lastRow, lastColumn).getValues()`.

Với Admin/PMO, thao tác này lặp qua mọi phòng/ban được mapping. Payload sau đó chứa context, master, detail slot và PB_DETAIL cùng nhiều trường dữ liệu.

**Tác động:** số cell đọc và response size tăng gần tuyến tính theo tổng kích thước tất cả sheet phòng/ban.

**Mức độ:** Critical.

### F05 — Payload đầu tiên chứa nhiều dữ liệu chưa cần cho first render

`qltdDeptPlanParseSheet_` dựng đầy đủ:

- `contexts`;
- `masters`;
- `detailSlots`;
- `details`/`PB_DETAIL`;
- ngày kế hoạch/thực tế;
- ngân sách;
- owner/coordinator/condition/note;
- progress/weight;
- context Gantt và trạng thái tuần.

First screen thường chỉ cần danh sách mục tiêu/master của phòng ban đang chọn và trạng thái tác nghiệp chính.

**Tác động:** thời gian Apps Script, JSON serialization, network transfer và frontend render đều tăng.

**Mức độ:** High.

### F06 — `qltdDeptPlanCache` hiện không tạo hiệu quả thực tế

Frontend khai báo `qltdDeptPlanCache = new Map()`, nhưng audit chỉ thấy cache được `clear()` trong `resetDeptScopedClientState()`; không thấy đường đọc/ghi cache cho payload listDeptPlans.

**Tác động:** quay lại màn hình hoặc chuyển qua lại dự án có thể gọi lại API và tải lại toàn bộ dữ liệu.

**Mức độ:** Medium.

### F07 — weekly_taskupdates_get tiếp tục đọc toàn bộ sheet và có phép tổng hợp lặp

`qltdWeeklyTaskUpdatesGet_` gọi `qltdWeeklyTaskUpdatesRead_()` để đọc toàn bộ sheet. Sau khi lọc scope, mỗi update còn tính `budgetCumulative` bằng cách lọc lại toàn bộ `read.updates`.

**Tác động:** khi số bản ghi tăng lớn, endpoint cập nhật tuần có thể trở thành nút thắt thứ hai sau listDeptPlans.

**Mức độ:** High theo quy mô dữ liệu.

### F08 — Các cơ chế tốt đã có, cần giữ nguyên

- Frontend dùng request sequence để chặn response dự án cũ ghi đè dự án mới.
- Weekly có cache và in-flight map theo project/dept/week.
- Backend đã có observability: `requestId`, `serverMs`, `rowsRead`, `cellsRead`, `recordCount`, `responseBytes`, `cacheHit`, counters.
- Dashboard đã được tách khỏi critical path và chỉ tải theo user intent.

Không được làm mất các cơ chế này trong patch tối ưu tiếp theo.

## 4. Kết luận nguyên nhân gốc

Nút thắt không nằm chủ yếu ở thao tác render frontend. Critical path hiện đang làm quá nhiều việc trong một request `listDeptPlans`:

```text
xác thực + danh sách phòng ban
+ dựng context Gantt
+ đọc toàn bộ WEEKLY_TASK_UPDATES
+ đọc toàn bộ vùng dữ liệu của nhiều sheet phòng/ban
+ dựng PB_DETAIL đầy đủ
+ serialize payload lớn
```

Do đó, chỉ thêm skeleton hoặc tối ưu vòng lặp JavaScript sẽ không giải quyết nguyên nhân gốc.

## 5. Phương án xử lý

### Phương án A — Hotfix cục bộ

- Frontend truyền `deptCode` đã lưu khi gọi `listDeptPlans`.
- Chỉ tải một phòng/ban ở lần khởi động.
- Khi đổi phòng/ban mới gọi lại `listDeptPlans(projectCode, deptCode)`.
- Danh sách phòng/ban lấy từ metadata nhẹ/nguồn mapping hiện có.

**Ưu:** giảm ngay số sheet đọc đối với Admin/PMO; phạm vi sửa nhỏ.

**Nhược:** vẫn còn phụ thuộc Gantt và full scan WEEKLY_TASK_UPDATES; cần nguồn metadata phòng/ban nhẹ, đúng quyền.

### Phương án B — Root-cause fix theo projection

Giữ action hiện tại nhưng thêm projection rõ ràng:

```text
listDeptPlans?projectCode=...&deptCode=...&projection=summary
```

`summary` chỉ trả:

- metadata dự án/phòng ban;
- MASTER cần hiển thị;
- trạng thái/progress tối thiểu;
- quyền thao tác;
- không trả PB_DETAIL đầy đủ;
- không dựng full Gantt nếu có thể đọc master context tối thiểu từ nguồn/cache phù hợp.

PB_DETAIL, lịch sử và dữ liệu tuần được lazy-load theo user intent.

**Ưu:** giữ tương thích endpoint, giảm payload và số cell đọc, không phải viết lại toàn bộ hệ thống.

**Nhược:** cần refactor cục bộ backend và bổ sung test projection/permission.

### Phương án C — Tách service hoàn chỉnh

Tách thành:

```text
report_bootstrap
report_getdeptmasters
report_getmasterdetails
weekly_getworkspace
```

**Ưu:** kiến trúc sạch, tối ưu cho mở rộng lớn.

**Nhược:** phạm vi thay đổi rộng, rủi ro regression cao; chưa phù hợp làm bước đầu khi chưa có benchmark live.

## 6. Khuyến nghị

Chọn lộ trình **A -> B**, không làm C ngay:

1. Đo live `listDeptPlans` trên 3 tài khoản/phạm vi: Admin, Editor, Reporter.
2. Ghi lại `serverMs`, `responseBytes`, `rowsRead`, `cellsRead`, `sheetCount`, `weeklyUpdateRowsRead`.
3. Hotfix chỉ tải phòng/ban ưu tiên cho Admin/PMO.
4. Thêm projection `summary` và lazy-load PB_DETAIL.
5. Sau mỗi bước so sánh P50/P95 và payload trước/sau.

## 7. Tiêu chí nghiệm thu patch kế tiếp

- Editor/Reporter mở Report: chỉ đọc phòng/ban được phép.
- Admin/PMO mở Report: không đọc toàn bộ sheet phòng/ban trước khi chọn.
- Không mở PB_DETAIL: không trả full PB_DETAIL.
- Không mở Gantt: Report không bắt buộc dựng full Gantt payload.
- Không có request trùng cùng project/dept/projection.
- Response dự án cũ không ghi đè dự án mới.
- `dashboardSummary = 0` nếu người dùng không mở Dashboard.
- Giữ nguyên phân quyền backend.
- Không thay đổi schema/trigger trong patch đầu.

## 8. File/hàm đã audit

- `README.md`
- `firebase-hosting-dev/app.js`
  - `renderProjectOptions`
  - `loadDeptPlansForSelectedProject`
  - `renderDeptPlans`
  - `loadWeeklyTaskData`
  - `loadWeeklyTaskDataForCurrent`
  - `fetchBackendJson`
  - cache/reset state liên quan
- `apps-script-dev-api/28_DEV_API.js`
  - GET dispatcher
  - `qltdDevApiListDeptPlans_`
  - `qltdDevApiJson_`
- `apps-script-dev-api/32_DEPT_PLAN_SERVICE.js`
  - `qltdDeptPlanListForProject_`
  - `qltdDeptPlanParseSheet_`
  - `qltdDeptPlanBuildMasterContextMap_`
  - `qltdDeptPlanReadWeeklyProgressStateMap_`
- `apps-script-dev-api/66_Weekly_Task_Update_Service.js`
  - `qltdWeeklyTaskUpdatesGet_`
  - `qltdWeeklyTaskUpdatesRead_`
- `apps-script-dev-api/72_Performance_Observability.js`
- Test liên quan tới critical boot, project isolation và weekly updates.

## 9. Trạng thái

- Audit code: hoàn thành.
- Live benchmark: chưa thực hiện; cần phiên đăng nhập DEV thực tế.
- Code runtime: chưa sửa.
- Firebase/Apps Script: chưa deploy.
- Google Sheet/schema/trigger: không thay đổi.
