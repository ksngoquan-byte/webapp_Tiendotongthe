import assert from 'node:assert/strict';
import { CANONICAL_DEPARTMENT_CODES, buildDepartmentDashboardModel, getDepartmentOwnerPresentation, getDepartmentPerformancePresentation, getDepartmentTaskCategory, getDeptCode, getDeptDisplayName, getProjectDeptKey } from './department-dashboard.js';

const today = new Date(2026, 5, 18);
const payloads = [
  {
    success: true,
    projectCode: 'HL',
    projectName: 'Hung Loc',
    mainMilestoneIds: ['a', 'g'],
    data: [
      { id: 'a', code: 'CV-A', masterTaskCode: 'CV-A', text: 'A', ownZone: 'Zone 1', ownHangMuc: 'Phap ly', hangMuc: 'Inherited parent', owner: 'Phong Phat trien du an', status: 'Dang thuc hien', start_date: '2026-06-01', end_date: '2026-06-17', wbs: 'V.1', raw: { 'Hang muc': 'Raw fallback must be ignored' } },
      { id: 'b', text: 'B', owner: 'PTDA', status: 'Chua bat dau', start_date: '2026-06-18', end_date: '2026-06-25', wbs: 'VIII.1', raw: { COL_6: '' } },
      { id: 'e', text: 'E', owner: 'PTDA', status: 'Chua bat dau', start_date: '2026-06-01', end_date: '2026-06-16' },
      { id: 'f', text: 'F', owner: 'PTDA', status: 'Dang thuc hien', start_date: '2026-06-01', end_date: '2026-06-15' },
      { id: 'g', code: 'CV-G', masterTaskCode: 'CV-G', text: 'G', owner: 'PTDA', status: 'Hoan thanh', start_date: '2026-06-01', end_date: '2026-06-28', actualFinish: '2026-06-12' },
      { id: 'c', text: 'C', owner: 'GPMB', status: 'Hoan thanh', start_date: '2026-06-01', end_date: '2026-06-10', actualFinish: '2026-06-10' },
      { id: 'cat', text: 'Hang muc', owner: 'PTDA', type: 'project' }
    ]
  },
  {
    success: true,
    projectCode: 'NC',
    projectName: 'Nam Cam',
    data: [
      { id: 'd', text: 'D', owner: 'PTDA', status: 'Hoan thanh', start_date: '2026-05-01', end_date: '2026-06-15', actualEnd: '2026-06-16' }
    ]
  }
];

assert.equal(getDeptCode('Phong Phat trien du an'), 'PTDA');
assert.equal(getDeptCode('Phong Quan ly du an'), 'BQLDA');
assert.equal(getDeptCode('Thiet ke'), 'THIETKE');
assert.equal(getDeptCode('THIETKE'), 'THIETKE');
assert.equal(getDeptCode('TK'), 'THIETKE');
assert.equal(getDeptCode('KINHDOANH'), 'KINHDOANH');
assert.equal(getDeptCode('KD'), 'KINHDOANH');
assert.deepEqual(CANONICAL_DEPARTMENT_CODES, ['BQLDA', 'PTDA', 'GPMB', 'THIETKE', 'TIEUCHUAN', 'DAUTHAU', 'KEHOACH', 'KETOAN', 'KINHDOANH', 'PHAPCHE', 'TAICHINH', 'MKT', 'VANHANH', 'UBNCSP', 'KSXD', 'NHANSU', 'HANHCHINH', 'CNTT', 'TROLY', 'BIM']);
for (const code of CANONICAL_DEPARTMENT_CODES) {
  assert.equal(getDeptCode(code), code);
}
for (const [alias, canonical] of Object.entries({
  QLDA: 'BQLDA', BQLDA: 'BQLDA',
  TK: 'THIETKE', Thietke: 'THIETKE', THIETKE_KYTHUAT: 'THIETKE',
  KD: 'KINHDOANH', KinhDoanh: 'KINHDOANH',
  Tieuchuan: 'TIEUCHUAN', Dauthau: 'DAUTHAU', Kehoach: 'KEHOACH',
  KeToan: 'KETOAN', Phapche: 'PHAPCHE', TaiChinh: 'TAICHINH',
  VanHanh: 'VANHANH', NhanSu: 'NHANSU', HanhChinh: 'HANHCHINH',
  Troly: 'TROLY', Bim: 'BIM'
})) {
  assert.equal(getDeptCode(alias), canonical);
}
assert.equal(getDeptCode('BQLDA_DB'), 'BQLDA');
assert.equal(getDeptCode('KinhDoanh_HL'), 'KINHDOANH');
assert.equal(getDeptCode('Thietke_HL1'), 'THIETKE');
assert.equal(getDeptDisplayName('QLDA'), 'Ban Quản lý dự án');
assert.equal(getDeptDisplayName('TK'), 'Thiết kế');
assert.equal(getDeptDisplayName('KD'), 'Kinh doanh');
assert.equal(getProjectDeptKey(' 37-5.hl ', 'Thiet ke'), '37-5.HL::THIETKE');
assert.equal(getProjectDeptKey('24-1.ĐB', 'QLDA'), '24-1.ĐB::BQLDA');
assert.equal(getDepartmentTaskCategory(payloads[0].data[0]), 'Phap ly');
assert.equal(getDepartmentTaskCategory(payloads[0].data[1]), '');
assert.equal(getDepartmentTaskCategory({ hangMuc: 'Inherited parent', raw: { HANG_MUC: 'Raw parent' } }), '');

const individualPayloads = [
  {
    success: true,
    projectCode: 'HL',
    projectName: 'Hung Loc',
    departments: [{
      deptCode: 'PTDA',
      masters: [{
        masterCode: 'CV-A',
        taskName: 'Phap ly',
        details: [
          { detailTaskId: 'hl-1', taskName: 'Viec Alice 1', ownHangMuc: 'Phap ly', owner: 'Alice Nguyen <alice@example.com>', status: 'Hoan thanh', progress: 100, planStart: '2026-06-01', planFinish: '2026-06-10', actualFinish: '2026-06-10' },
          { detailTaskId: 'hl-2', taskName: 'Viec Alice 2', owner: 'Alice Nguyen <ALICE@example.com>', status: 'Dang thuc hien', progress: 50, planStart: '2026-06-01', planFinish: '2026-06-17' },
          { detailTaskId: 'hl-3', taskName: 'Owner cu', owner: 'Cuu Nhan Su <former@example.com>', status: 'Chua bat dau', progress: 0, planStart: '2026-06-01', planFinish: '2026-06-25' },
          { detailTaskId: 'hl-4', taskName: 'Chua giao', owner: '', status: '', progress: 0, planStart: '2026-06-01', planFinish: '2026-06-16' }
        ]
      }]
    }, {
      deptCode: 'GPMB',
      masters: [{
        masterCode: 'CV-C',
        taskName: 'Giai phong mat bang',
        details: [
          { detailTaskId: 'hl-5', taskName: 'Viec GPMB', owner: 'GPMB User <gpmb@example.com>', status: 'Hoan thanh', progress: 100, planStart: '2026-06-01', planFinish: '2026-06-10', actualFinish: '2026-06-10' }
        ]
      }]
    }]
  },
  {
    success: true,
    projectCode: 'NC',
    projectName: 'Nam Cam',
    departments: [{
      deptCode: 'PTDA',
      masters: [{
        masterCode: 'CV-D',
        taskName: 'Ha tang',
        details: [
          { detailTaskId: 'nc-1', taskName: 'Viec Alice 3', owner: 'Alice Nguyen <alice@example.com>', status: 'Hoan thanh', progress: 100, planStart: '2026-05-01', planFinish: '2026-06-15', actualFinish: '2026-06-16' }
        ]
      }]
    }]
  }
];

// A. Tất cả phòng/ban + tất cả dự án: group by DeptCode.
const allDepartmentsAllProjects = buildDepartmentDashboardModel(payloads, {}, today, { detailPayloads: individualPayloads });
assert.equal(allDepartmentsAllProjects.kpis.total, 6);
assert.equal(allDepartmentsAllProjects.departmentEfficiency.find((row) => row.deptCode === 'PTDA')?.total, 5);
assert.equal(allDepartmentsAllProjects.departmentEfficiency.find((row) => row.deptCode === 'GPMB')?.total, 1);

// B. Tất cả phòng/ban + một dự án: vẫn group by DeptCode và chỉ lấy HL.
const allDepartmentsOneProject = buildDepartmentDashboardModel(payloads, { projectCode: 'HL' }, today, { detailPayloads: individualPayloads });
assert.equal(allDepartmentsOneProject.kpis.total, 5);
assert.equal(allDepartmentsOneProject.departmentEfficiency.find((row) => row.deptCode === 'PTDA')?.total, 4);
assert.equal(allDepartmentsOneProject.departmentEfficiency.find((row) => row.deptCode === 'GPMB')?.total, 1);

// C. Một phòng/ban + tất cả dự án: group chủ trì ổn định theo email.
const oneDepartmentAllProjects = buildDepartmentDashboardModel(payloads, { deptCode: 'PTDA' }, today, { detailPayloads: individualPayloads });
assert.equal(oneDepartmentAllProjects.kpis.total, 5);
assert.equal(oneDepartmentAllProjects.individualEfficiency.reduce((sum, row) => sum + row.total, 0), 4);
assert.equal(oneDepartmentAllProjects.individualEfficiency.find((row) => row.ownerEmail === 'alice@example.com')?.total, 3);
assert.equal(oneDepartmentAllProjects.individualEfficiency.find((row) => row.ownerEmail === 'former@example.com')?.ownerLabel, 'Cuu Nhan Su <former@example.com>');
assert.equal(oneDepartmentAllProjects.individualEfficiency.some((row) => row.ownerKey === 'UNASSIGNED'), false);
assert.equal(oneDepartmentAllProjects.kpis.total, allDepartmentsAllProjects.departmentEfficiency.find((row) => row.deptCode === 'PTDA')?.total);

// D. Một phòng/ban + một dự án: chỉ lấy PB_DETAIL của HL.
const oneDepartmentOneProject = buildDepartmentDashboardModel(payloads, { deptCode: 'PTDA', projectCode: 'HL' }, today, { detailPayloads: individualPayloads });
assert.equal(oneDepartmentOneProject.kpis.total, 4);
assert.equal(oneDepartmentOneProject.individualEfficiency.reduce((sum, row) => sum + row.total, 0), 3);
assert.equal(oneDepartmentOneProject.individualEfficiency.find((row) => row.ownerEmail === 'alice@example.com')?.total, 2);
assert.equal(oneDepartmentOneProject.kpis.completed, 1);
assert.equal(oneDepartmentOneProject.kpis.inProgress, 1);
assert.equal(oneDepartmentOneProject.kpis.notStarted, 2);
assert.equal(oneDepartmentOneProject.individualEfficiency.find((row) => row.ownerEmail === 'alice@example.com')?.completionPercent, 50);
assert.equal(oneDepartmentOneProject.kpis.total, allDepartmentsOneProject.departmentEfficiency.find((row) => row.deptCode === 'PTDA')?.total);

// Phòng/ban hoặc dự án không có công việc phải giữ filter và trả tập rỗng an toàn.
const emptyDepartment = buildDepartmentDashboardModel(payloads, { deptCode: 'THIETKE' }, today, { detailPayloads: individualPayloads });
assert.equal(emptyDepartment.kpis.total, 0);
assert.equal(emptyDepartment.departments.some((dept) => dept.code === 'THIETKE'), true);
const emptyProject = buildDepartmentDashboardModel(payloads, { deptCode: 'PTDA', projectCode: 'EMPTY' }, today, { detailPayloads: individualPayloads });
assert.equal(emptyProject.kpis.total, 0);
assert.equal(emptyProject.individualEfficiency.length, 0);

assert.deepEqual(getDepartmentPerformancePresentation(''), {
  individual: false, title: 'Hiệu quả phòng/ban', firstColumnLabel: 'PHÒNG/BAN', emptyMessage: 'Không có phòng/ban phù hợp.'
});
assert.deepEqual(getDepartmentPerformancePresentation('PTDA'), {
  individual: true, title: 'Hiệu quả cá nhân', firstColumnLabel: 'CÁ NHÂN', emptyMessage: 'Không có cá nhân phù hợp.'
});
assert.equal(oneDepartmentOneProject.tasks.find((task) => task.id === 'hl-1')?.contextLabel, 'Phap ly');
assert.equal(allDepartmentsAllProjects.tasks.some((task) => task.id === 'cat'), false);
assert.equal(Object.prototype.hasOwnProperty.call(oneDepartmentOneProject.kpis, 'missingDates'), false);

assert.deepEqual(getDepartmentOwnerPresentation('Alice Nguyen <alice@example.com>'), {
  display: 'Alice Nguyen',
  title: 'alice@example.com',
  email: 'alice@example.com',
  name: 'Alice Nguyen'
});
assert.equal(getDepartmentOwnerPresentation('only.email@example.com').display, 'only.email@example.com');
assert.equal(getDepartmentOwnerPresentation('').display, 'Chưa rõ');

const mixedMasterPayloads = [
  {
    success: true,
    projectCode: '37-5.HL',
    projectName: 'Thấp tầng Hưng Lộc',
    mainMilestoneIds: ['hl-master-1'],
    data: [
      { id: 'hl-master-1', code: 'HL-1', text: 'Master Hưng Lộc 1', owner: 'PTDA', status: 'Dang thuc hien', start_date: '2026-06-01', end_date: '2026-06-25' },
      { id: 'hl-master-2', code: 'HL-2', text: 'Master Hưng Lộc 2', owner: 'GPMB', status: 'Chua bat dau', start_date: '2026-06-01', end_date: '2026-06-28' }
    ]
  },
  {
    success: true,
    projectCode: 'DETAIL',
    projectName: 'Dự án có PB_DETAIL',
    data: [
      { id: 'detail-master', code: 'DT-1', masterTaskCode: 'DT-1', text: 'Master phải được thay thế', owner: 'PTDA', status: 'Dang thuc hien', start_date: '2026-06-01', end_date: '2026-06-28' }
    ]
  }
];
const mixedDetailPayloads = [
  {
    success: true,
    projectCode: '37-5.hl',
    projectName: 'Thấp tầng Hưng Lộc',
    departments: [{ deptCode: 'PTDA', masters: [{ masterCode: 'HL-1', details: [] }] }]
  },
  {
    success: true,
    projectCode: 'detail',
    projectName: 'Dự án có PB_DETAIL',
    departments: [{
      deptCode: 'PTDA',
      masters: [{
        masterCode: 'DT-1',
        taskName: 'Hạng mục chi tiết',
        details: [{ detailTaskId: 'detail-1', taskName: 'Việc chi tiết thật', owner: 'Detail User <detail@example.com>', status: 'Dang thuc hien', progress: 50, planStart: '2026-06-01', planFinish: '2026-06-28' }]
      }]
    }]
  }
];

const mixedModel = buildDepartmentDashboardModel(mixedMasterPayloads, {}, today, { detailPayloads: mixedDetailPayloads });
assert.equal(mixedModel.kpis.total, 3);
assert.equal(mixedModel.tasks.filter((task) => task.projectCode === '37-5.HL').length, 2);
assert.equal(mixedModel.tasks.filter((task) => String(task.projectCode).toUpperCase() === 'DETAIL').length, 1);
assert.equal(mixedModel.projectSummary.find((row) => row.projectCode === '37-5.HL')?.total, 2);
assert.equal(mixedModel.projectSummary.find((row) => row.projectCode === 'DETAIL')?.total, 1);

const hungLocFallback = buildDepartmentDashboardModel(mixedMasterPayloads, { projectCode: '37-5.hl' }, today, { detailPayloads: mixedDetailPayloads });
assert.equal(hungLocFallback.kpis.total, 2);
assert.deepEqual(hungLocFallback.masterFallbackProjects, ['37-5.HL']);

const hungLocDepartment = buildDepartmentDashboardModel(mixedMasterPayloads, { projectCode: '37-5.HL', deptCode: 'PTDA' }, today, { detailPayloads: mixedDetailPayloads });
assert.equal(hungLocDepartment.kpis.total, 1);
assert.equal(hungLocDepartment.individualEfficiency.length, 0);
assert.deepEqual(hungLocDepartment.masterFallbackProjects, ['37-5.HL']);
assert.equal(hungLocDepartment.individualEmptyMessage, 'Phòng/ban chưa có công việc chi tiết theo cá nhân.');

// Fallback phải theo project + dept: 2 phòng có detail, 3 phòng chỉ có Master.
const cocLeuMasterPayloads = [{
  projectCode: 'COC-LEU',
  projectName: 'Cốc Lếu',
  data: [
    { id: 'cl-kd', text: 'Master KD', owner: 'Phòng Kinh doanh', status: 'Đang thực hiện', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'cl-kh', text: 'Master KH', owner: 'Phòng Kế hoạch', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'cl-ptda', text: 'Master PTDA', owner: 'PTDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'cl-gpmb', text: 'Master GPMB', owner: 'GPMB', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'cl-tk', text: 'Master thiết kế', owner: 'Phòng Thiết kế', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'cl-common', text: 'Mục tiêu chung', owner: '', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }
  ]
}];
const cocLeuDetailPayloads = [{
  projectCode: 'coc-leu',
  projectName: 'Cốc Lếu',
  departments: [
    { deptCode: 'KINHDOANH', deptName: 'Phòng Kinh doanh', masters: [{ masterCode: 'cl-kd', details: [{ detailTaskId: 'cl-kd-1', taskName: 'Chi tiết KD', owner: 'KD User <kd@example.com>', status: 'Đang thực hiện', planStart: '2026-06-01', planFinish: '2026-06-30' }] }] },
    { deptCode: 'KEHOACH', deptName: 'Phòng Kế hoạch', masters: [{ masterCode: 'cl-kh', details: [{ detailTaskId: 'cl-kh-1', taskName: 'Chi tiết KH', owner: 'KH User <kh@example.com>', status: 'Hoàn thành', planStart: '2026-06-01', planFinish: '2026-06-20', actualFinish: '2026-06-20' }] }] },
    { deptCode: 'PTDA', deptName: 'Phát triển dự án', masters: [] },
    { deptCode: 'GPMB', deptName: 'Giải phóng mặt bằng', masters: [] },
    { deptCode: 'THIETKE', deptName: 'Phòng Thiết kế', projectUnitCode: 'TK', masters: [] }
  ]
}];
const cocLeu = buildDepartmentDashboardModel(cocLeuMasterPayloads, { projectCode: 'COC-LEU' }, today, { detailPayloads: cocLeuDetailPayloads });
assert.deepEqual(cocLeu.departmentEfficiency.map((row) => row.deptCode).sort(), ['GPMB', 'KEHOACH', 'KINHDOANH', 'PTDA', 'THIETKE']);
assert.equal(cocLeu.departmentEfficiency.length, 5);
assert.equal(cocLeu.tasks.some((task) => task.id === 'cl-kd'), false);
assert.equal(cocLeu.tasks.some((task) => task.id === 'cl-kh'), false);
assert.equal(cocLeu.tasks.some((task) => task.id === 'cl-ptda'), true);
assert.equal(cocLeu.tasks.some((task) => task.id === 'cl-gpmb'), true);
assert.equal(cocLeu.tasks.some((task) => task.id === 'cl-tk' && task.deptCode === 'THIETKE'), true);
assert.equal(cocLeu.tasks.some((task) => task.id === 'cl-common' && task.deptCode === 'UNASSIGNED'), true);
assert.equal(cocLeu.departmentEfficiency.some((row) => row.deptCode === 'UNASSIGNED'), false);
assert.equal(cocLeu.kpis.total, 6);

// Full detail, partial detail và chưa có detail không được mất phòng hoặc đếm trùng.
const threeProjectMasters = [
  { projectCode: 'FULL', data: [
    { id: 'full-a', text: 'Full A master', deptCode: 'PTDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'full-b', text: 'Full B master', deptCode: 'GPMB', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }
  ] },
  { projectCode: 'PARTIAL', data: [
    { id: 'partial-a', text: 'Partial A master', deptCode: 'PTDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'partial-b', text: 'Partial B master', deptCode: 'GPMB', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }
  ] },
  { projectCode: 'NONE', data: [
    { id: 'none-a', text: 'None A master', deptCode: 'PTDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'none-b', text: 'None B master', deptCode: 'GPMB', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }
  ] }
];
const makeDetail = (id, owner) => ({ detailTaskId: id, taskName: id, owner, status: 'Đang thực hiện', planStart: '2026-06-01', planFinish: '2026-06-30' });
const threeProjectDetails = [
  { projectCode: 'FULL', departments: [
    { deptCode: 'PTDA', masters: [{ masterCode: 'full-a', details: [makeDetail('full-a-detail', 'A <a@example.com>')] }] },
    { deptCode: 'GPMB', masters: [{ masterCode: 'full-b', details: [makeDetail('full-b-detail', 'B <b@example.com>')] }] }
  ] },
  { projectCode: 'PARTIAL', departments: [
    { deptCode: 'PTDA', masters: [{ masterCode: 'partial-a', details: [makeDetail('partial-a-detail', 'C <c@example.com>')] }] },
    { deptCode: 'GPMB', masters: [] }
  ] },
  { projectCode: 'NONE', departments: [{ deptCode: 'PTDA', masters: [] }, { deptCode: 'GPMB', masters: [] }] }
];
const threeProjectModel = buildDepartmentDashboardModel(threeProjectMasters, {}, today, { detailPayloads: threeProjectDetails });
assert.equal(threeProjectModel.kpis.total, 6);
assert.equal(threeProjectModel.tasks.filter((task) => task.dashboardSource === 'detail').length, 3);
assert.equal(threeProjectModel.tasks.filter((task) => task.dashboardSource === 'master').length, 3);
assert.equal(threeProjectModel.tasks.some((task) => task.id === 'partial-b'), true);
assert.equal(threeProjectModel.tasks.some((task) => task.id === 'partial-a'), false);

// Danh tính phòng là global; Project_Depts chỉ cung cấp quan hệ và tên theo ngữ cảnh dự án.
const globalDepartmentMasters = [
  { projectCode: 'COC-LEU-GLOBAL', projectName: 'Cốc Lếu', data: [
    { id: 'global-cl-ptda', code: 'GLOBAL-CL-PTDA', text: 'PTDA Cốc Lếu', deptCode: 'PTDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'global-cl-tk', code: 'GLOBAL-CL-TK', text: 'Thiết kế Cốc Lếu', deptCode: 'TK', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }
  ] },
  { projectCode: 'C1-HUNG-LOC', projectName: 'C1 Hưng Lộc', data: [
    { id: 'global-c1-ptda', code: 'GLOBAL-C1-PTDA', text: 'PTDA C1 Hưng Lộc', deptCode: 'PTDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'global-c1-tk', code: 'GLOBAL-C1-TK', text: 'Thiết kế C1 Hưng Lộc', deptCode: 'THIETKE', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }
  ] },
  { projectCode: 'TT-HUNG-LOC', projectName: 'Thấp tầng Hưng Lộc', data: [
    { id: 'global-tt-ptda', code: 'GLOBAL-TT-PTDA', text: 'PTDA Thấp tầng Hưng Lộc', deptCode: 'PTDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }
  ] }
];
const globalDepartmentDetails = [
  { projectCode: 'COC-LEU-GLOBAL', departments: [
    { deptCode: 'PTDA', deptName: 'PTDA Cốc Lếu', masters: [{ masterCode: 'GLOBAL-CL-PTDA', details: [makeDetail('global-cl-ptda-detail', 'CL User <cl@example.com>')] }] },
    { deptCode: 'THIETKE', deptName: 'Thiết kế Cốc Lếu', masters: [] }
  ] },
  { projectCode: 'C1-HUNG-LOC', departments: [
    { deptCode: 'PTDA', deptName: 'PTDA C1 Hưng Lộc', masters: [] },
    { deptCode: 'TK', deptName: 'Thiết kế C1 Hưng Lộc', masters: [{ masterCode: 'GLOBAL-C1-TK', details: [makeDetail('global-c1-tk-detail', 'TK User <tk@example.com>')] }] }
  ] },
  { projectCode: 'TT-HUNG-LOC', departments: [
    { deptCode: 'PTDA', deptName: 'PTDA Thấp tầng Hưng Lộc', masters: [{ masterCode: 'GLOBAL-TT-PTDA', details: [makeDetail('global-tt-ptda-detail', 'TT User <tt@example.com>')] }] }
  ] }
];
const globalDepartmentModel = buildDepartmentDashboardModel(globalDepartmentMasters, {}, today, { detailPayloads: globalDepartmentDetails });
assert.equal(globalDepartmentModel.departments.filter((dept) => dept.code === 'PTDA').length, 1);
assert.equal(globalDepartmentModel.departments.find((dept) => dept.code === 'PTDA')?.name, 'Phát triển dự án');
assert.equal(globalDepartmentModel.departmentEfficiency.filter((row) => row.deptCode === 'PTDA').length, 1);
assert.equal(globalDepartmentModel.departmentEfficiency.find((row) => row.deptCode === 'PTDA')?.total, 3);
assert.equal(globalDepartmentModel.departments.filter((dept) => dept.code === 'THIETKE').length, 1);
assert.equal(globalDepartmentModel.departments.find((dept) => dept.code === 'THIETKE')?.name, 'Thiết kế');
assert.equal(globalDepartmentModel.departmentEfficiency.find((row) => row.deptCode === 'THIETKE')?.total, 2);
assert.equal(globalDepartmentModel.departments.some((dept) => /Cốc Lếu|Hưng Lộc/.test(dept.name)), false);
assert.notEqual(getProjectDeptKey('COC-LEU-GLOBAL', 'PTDA'), getProjectDeptKey('C1-HUNG-LOC', 'PTDA'));

const globalPtdaFilter = buildDepartmentDashboardModel(globalDepartmentMasters, { deptCode: 'PTDA' }, today, { detailPayloads: globalDepartmentDetails });
assert.equal(globalPtdaFilter.kpis.total, 3);
assert.equal(globalPtdaFilter.individualEfficiency.length, 2);
const cocLeuPtdaFilter = buildDepartmentDashboardModel(globalDepartmentMasters, { deptCode: 'PTDA', projectCode: 'COC-LEU-GLOBAL' }, today, { detailPayloads: globalDepartmentDetails });
assert.equal(cocLeuPtdaFilter.kpis.total, 1);
assert.equal(cocLeuPtdaFilter.departments.find((dept) => dept.code === 'PTDA')?.name, 'Phát triển dự án');
assert.equal(cocLeuPtdaFilter.individualEfficiency.length, 1);
assert.equal(buildDepartmentDashboardModel(globalDepartmentMasters, { projectCode: 'COC-LEU-GLOBAL' }, today, { detailPayloads: globalDepartmentDetails }).departmentEfficiency.find((row) => row.deptCode === 'PTDA')?.total, 1);

// Mọi alias phải quy về canonical duy nhất; BQLDA và QLDA là cùng một đơn vị.
const aliasModel = buildDepartmentDashboardModel([{
  projectCode: 'ALIAS',
  data: [
    { id: 'alias-tk', text: 'Thiết kế', owner: 'Phòng Thiết kế', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'alias-kd', text: 'Kinh doanh', owner: 'Phòng Kinh doanh', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'alias-bqlda', text: 'Ban QLDA', owner: 'Ban QLDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'alias-qlda', text: 'QLDA', deptCode: 'QLDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }
  ]
}], {}, today, { detailPayloads: [{
  projectCode: 'ALIAS',
  departments: [
    { deptCode: 'THIETKE', projectUnitCode: 'TK', deptName: 'Phòng Thiết kế', masters: [] },
    { deptCode: 'KINHDOANH', projectUnitCode: 'KD', deptName: 'Phòng Kinh doanh', masters: [] },
    { deptCode: 'BQLDA', deptName: 'Ban QLDA', masters: [] },
    { deptCode: 'QLDA', deptName: 'Quản lý dự án', masters: [] }
  ]
}] });
assert.deepEqual(aliasModel.departmentEfficiency.map((row) => row.deptCode).sort(), ['BQLDA', 'KINHDOANH', 'THIETKE']);
assert.equal(aliasModel.departmentEfficiency.find((row) => row.deptCode === 'BQLDA')?.total, 2);
assert.equal(aliasModel.tasks.find((task) => task.id === 'alias-tk')?.deptCode, 'THIETKE');
assert.equal(aliasModel.tasks.find((task) => task.id === 'alias-kd')?.deptCode, 'KINHDOANH');
assert.equal(aliasModel.tasks.find((task) => task.id === 'alias-bqlda')?.deptCode, 'BQLDA');
assert.equal(aliasModel.tasks.find((task) => task.id === 'alias-qlda')?.deptCode, 'BQLDA');

// Master QLDA và PB_DETAIL BQLDA cùng project phải dùng chung key và chỉ đếm detail.
const bqldaCanonicalModel = buildDepartmentDashboardModel([{
  projectCode: '24-1.ĐB',
  projectName: 'Điện Biên',
  data: [{ id: 'db-master', code: 'DB-M1', text: 'Master QLDA', deptCode: 'QLDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }]
}], {}, today, { detailPayloads: [{
  projectCode: '24-1.ĐB',
  projectName: 'Điện Biên',
  departments: [{
    deptCode: 'BQLDA',
    MasterDeptCode: 'QLDA',
    projectUnitCode: 'BQLDA_DB',
    deptName: 'Ban Quản lý dự án Điện Biên',
    masters: [{ masterCode: 'DB-M1', details: [makeDetail('db-detail', 'DB User <db@example.com>')] }]
  }]
}] });
assert.equal(bqldaCanonicalModel.kpis.total, 1);
assert.equal(bqldaCanonicalModel.tasks[0]?.id, 'db-detail');
assert.equal(bqldaCanonicalModel.tasks[0]?.deptCode, 'BQLDA');
assert.deepEqual(bqldaCanonicalModel.departmentEfficiency.map((row) => row.deptCode), ['BQLDA']);
assert.equal(bqldaCanonicalModel.departmentEfficiency[0]?.deptName, 'Ban Quản lý dự án');
assert.equal(bqldaCanonicalModel.tasks.some((task) => task.id === 'db-master'), false);

// Thứ tự nguồn mã và hậu tố ProjectUnitCode phải canonicalize trước khi tạo key.
const projectUnitModel = buildDepartmentDashboardModel([{
  projectCode: 'UNIT',
  data: [
    { id: 'unit-bqlda', text: 'BQLDA suffix', projectUnitCode: 'BQLDA_DB', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'unit-kd', text: 'KD suffix', projectUnitCode: 'KinhDoanh_HL', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'unit-tk', text: 'TK suffix', projectUnitCode: 'Thietke_HL1', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' },
    { id: 'unit-priority', text: 'DeptCode wins', deptCode: 'KeToan', projectUnitCode: 'BQLDA_DB', MasterDeptCode: 'QLDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }
  ]
}], {}, today, { detailPayloads: [{ projectCode: 'UNIT', departments: [] }] });
assert.equal(projectUnitModel.tasks.find((task) => task.id === 'unit-bqlda')?.deptCode, 'BQLDA');
assert.equal(projectUnitModel.tasks.find((task) => task.id === 'unit-kd')?.deptCode, 'KINHDOANH');
assert.equal(projectUnitModel.tasks.find((task) => task.id === 'unit-tk')?.deptCode, 'THIETKE');
assert.equal(projectUnitModel.tasks.find((task) => task.id === 'unit-priority')?.deptCode, 'KETOAN');

// Mixed projects dùng alias khác nhau vẫn không split hoặc đếm đồng thời Master + detail.
const canonicalMixedMasters = [
  { projectCode: 'CAN-A', data: [{ id: 'can-a-master', code: 'CAN-A-M', text: 'QLDA master', deptCode: 'QLDA', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }] },
  { projectCode: 'CAN-B', data: [{ id: 'can-b-master', code: 'CAN-B-M', text: 'TK master', deptCode: 'TK', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }] },
  { projectCode: 'CAN-C', data: [{ id: 'can-c-master', code: 'CAN-C-M', text: 'Kinh doanh master', deptCode: 'KINHDOANH', status: 'Chưa bắt đầu', start_date: '2026-06-01', end_date: '2026-06-30' }] }
];
const canonicalMixedDetails = [
  { projectCode: 'CAN-A', departments: [{ deptCode: 'BQLDA', masters: [{ masterCode: 'CAN-A-M', details: [makeDetail('can-a-detail', 'A <a@example.com>')] }] }] },
  { projectCode: 'CAN-B', departments: [{ deptCode: 'Thietke', masters: [{ masterCode: 'CAN-B-M', details: [makeDetail('can-b-detail', 'B <b@example.com>')] }] }] },
  { projectCode: 'CAN-C', departments: [{ deptCode: 'KD', masters: [{ masterCode: 'CAN-C-M', details: [makeDetail('can-c-detail', 'C <c@example.com>')] }] }] }
];
const canonicalMixedModel = buildDepartmentDashboardModel(canonicalMixedMasters, {}, today, { detailPayloads: canonicalMixedDetails });
assert.equal(canonicalMixedModel.kpis.total, 3);
assert.equal(canonicalMixedModel.tasks.every((task) => task.dashboardSource === 'detail'), true);
assert.deepEqual(canonicalMixedModel.departmentEfficiency.map((row) => row.deptCode).sort(), ['BQLDA', 'KINHDOANH', 'THIETKE']);
assert.equal(buildDepartmentDashboardModel(canonicalMixedMasters, { projectCode: 'CAN-A' }, today, { detailPayloads: canonicalMixedDetails }).kpis.total, 1);
assert.equal(buildDepartmentDashboardModel(canonicalMixedMasters, { deptCode: 'QLDA' }, today, { detailPayloads: canonicalMixedDetails }).kpis.total, 1);
assert.equal(buildDepartmentDashboardModel(canonicalMixedMasters, { deptCode: 'TK', projectCode: 'CAN-B' }, today, { detailPayloads: canonicalMixedDetails }).kpis.total, 1);
assert.equal(buildDepartmentDashboardModel(canonicalMixedMasters, { deptCode: 'KD', projectCode: 'CAN-C' }, today, { detailPayloads: canonicalMixedDetails }).kpis.total, 1);

// Owner rỗng/placeholder vẫn tính KPI phòng nhưng tuyệt đối không tạo cá nhân giả.
const unassignedOwnerModel = buildDepartmentDashboardModel([], { deptCode: 'KEHOACH', projectCode: 'OWNER' }, today, { detailPayloads: [{
  projectCode: 'OWNER',
  departments: [{ deptCode: 'KEHOACH', masters: [{ masterCode: 'M1', details: [
    makeDetail('owner-real', 'Real Person <real@example.com>'),
    makeDetail('owner-empty', '   '),
    makeDetail('owner-placeholder', 'CHƯA PHÂN CÔNG'),
    { ...makeDetail('owner-fields', ''), ownerEmail: 'fields@example.com', ownerName: 'Fields Person' }
  ] }] }]
}] });
assert.equal(unassignedOwnerModel.kpis.total, 4);
assert.equal(unassignedOwnerModel.individualEfficiency.length, 2);
assert.equal(unassignedOwnerModel.individualEfficiency.reduce((sum, row) => sum + row.total, 0), 2);
assert.equal(unassignedOwnerModel.individualEfficiency.some((row) => row.ownerKey === 'UNASSIGNED'), false);

const onlyUnassignedOwners = buildDepartmentDashboardModel([], { deptCode: 'KEHOACH', projectCode: 'EMPTY-OWNERS' }, today, { detailPayloads: [{
  projectCode: 'EMPTY-OWNERS',
  departments: [{ deptCode: 'KEHOACH', masters: [{ masterCode: 'M1', details: [
    makeDetail('empty-owner', ''),
    makeDetail('placeholder-owner', 'CHƯA PHÂN CÔNG')
  ] }] }]
}] });
assert.equal(onlyUnassignedOwners.kpis.total, 2);
assert.equal(onlyUnassignedOwners.individualEfficiency.length, 0);
assert.equal(onlyUnassignedOwners.individualEmptyMessage, 'Chưa có công việc được phân công cho cá nhân.');

console.log('Department dashboard context filters and individual owner aggregation passed.');
