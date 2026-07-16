const REGISTRATION_GATE_ID = 'qltdRegistrationGate';

export function buildRegistrationDepartments(profiles = []) {
  const seen = new Set();
  return profiles.reduce((items, profile) => {
    const deptCode = String(profile?.deptCode || '').trim();
    const deptName = String(profile?.deptName || '').trim();
    if (!deptCode || seen.has(deptCode)) return items;
    seen.add(deptCode);
    items.push({ deptCode, deptName: deptName || deptCode });
    return items;
  }, []);
}

export function buildRegistrationPositions(profiles = [], deptCode = '') {
  const selectedDept = String(deptCode || '').trim();
  const matches = profiles.filter((profile) => String(profile?.deptCode || '').trim() === selectedDept);
  const labelCounts = {};
  matches.forEach((profile) => {
    const label = String(profile?.position || 'Chưa có vị trí').trim();
    labelCounts[label] = (labelCounts[label] || 0) + 1;
  });
  return matches.map((profile) => {
    const position = String(profile?.position || 'Chưa có vị trí').trim();
    return {
      empCode: String(profile?.empCode || '').trim(),
      label: labelCounts[position] > 1 ? `${position} — ${profile.empCode}` : position
    };
  });
}

export function getRegistrationErrorMessage(result) {
  const code = String(result?.error?.code || result?.errorCode || result?.message || '').trim().toUpperCase();
  const messages = {
    ID_TOKEN_REQUIRED: 'Không tìm thấy phiên đăng nhập Google. Vui lòng đăng nhập lại.',
    ID_TOKEN_INVALID: 'Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
    USER_NOT_REGISTERED: 'Tài khoản chưa được đăng ký trên hệ thống.',
    USER_DUPLICATE: 'Dữ liệu tài khoản bị trùng. Vui lòng liên hệ quản trị.',
    USER_DISABLED: 'Tài khoản của bạn đã bị vô hiệu hóa.',
    EMPLOYEE_ALREADY_LINKED: 'Hồ sơ nhân sự này đã được liên kết với tài khoản Google khác.',
    EMP_CODE_ALREADY_LINKED: 'Hồ sơ nhân sự này đã được liên kết với tài khoản Google khác.',
    USER_INACTIVE: 'Tài khoản của bạn đang bị khóa.',
    EMPLOYEE_INACTIVE: 'Hồ sơ không còn trạng thái làm việc.',
    EMPLOYEE_NOT_FOUND: 'Không tìm thấy hồ sơ nhân sự.',
    EMPLOYEE_DUPLICATE: 'Mã nhân sự đang bị trùng trong nguồn nhân sự. Vui lòng liên hệ quản trị.',
    EMAIL_MISMATCH: 'Email gửi lên không khớp tài khoản Google đang đăng nhập.',
    ID_TOKEN_EXPIRED: 'Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.',
    REGISTRATION_CONFLICT: 'Thông tin đăng ký đã thay đổi hoặc đang được xử lý. Vui lòng tải lại và thử lại.',
    SOURCE_SHEET_NOT_FOUND: 'Không tìm thấy nguồn dữ liệu nhân sự đã cấu hình.',
    SOURCE_CONFIGURATION_ERROR: 'Cấu hình nguồn dữ liệu chưa hợp lệ. Vui lòng liên hệ quản trị.',
    INTERNAL_ERROR: 'Hệ thống không thể hoàn tất yêu cầu. Vui lòng thử lại.',
    INVALID_ROLE: 'Vai trò tài khoản không hợp lệ. Vui lòng liên hệ quản trị.'
  };
  return messages[code] || String(result?.error?.message || result?.errorMessage || result?.message || 'Không thể hoàn tất yêu cầu.');
}

export function createRegistrationGate(options = {}) {
  let profiles = [];
  let currentUser = null;
  let lookupInFlight = false;
  let registrationInFlight = false;

  function ensureStyles() {
    if (document.getElementById('qltdRegistrationGateStyles')) return;
    const style = document.createElement('style');
    style.id = 'qltdRegistrationGateStyles';
    style.textContent = `
      .qltd-registration-gate{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#dfeafd,#78a2ed 65%,#4d7ed8)}
      .qltd-registration-card{width:min(680px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:30px;border-radius:22px;background:#fff;box-shadow:0 28px 70px rgba(15,23,42,.25);font-family:Inter,"Segoe UI",Arial,sans-serif;color:#0f172a}
      .qltd-registration-card h2{margin:4px 0 8px;font-size:28px}.qltd-registration-card p{color:#64748b;line-height:1.55}
      .qltd-registration-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.qltd-registration-field{display:grid;gap:7px;margin-top:14px}
      .qltd-registration-field label{font-weight:700;font-size:14px}.qltd-registration-field input,.qltd-registration-field select{min-height:44px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;background:#fff}
      .qltd-registration-field input[readonly]{background:#f1f5f9}.qltd-registration-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}
      .qltd-registration-actions button{min-height:44px;padding:0 18px;border-radius:10px;border:0;font-weight:700;cursor:pointer}
      .qltd-registration-primary{background:#0b3ea8;color:#fff}.qltd-registration-secondary{background:#e2e8f0;color:#0f172a}
      .qltd-registration-status{min-height:22px;margin:14px 0 0!important;font-weight:600}.qltd-registration-status.error{color:#b91c1c}.qltd-registration-status.success{color:#047857}
      @media(max-width:640px){.qltd-registration-grid{grid-template-columns:1fr}.qltd-registration-card{padding:22px}.qltd-registration-actions{flex-direction:column}.qltd-registration-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function hide() {
    document.getElementById(REGISTRATION_GATE_ID)?.remove();
  }

  function setStatus(message, type = '') {
    const status = document.getElementById('qltdRegistrationStatus');
    if (!status) return;
    status.className = `qltd-registration-status${type ? ` ${type}` : ''}`;
    status.textContent = message || '';
  }

  function setBusy(isBusy) {
    const gate = document.getElementById(REGISTRATION_GATE_ID);
    gate?.querySelectorAll('button,input,select').forEach((element) => {
      if (element.id === 'qltdRegistrationSignOut') return;
      if (isBusy) {
        element.dataset.qltdPreviousDisabled = element.disabled ? '1' : '0';
        element.disabled = true;
      } else {
        element.disabled = element.dataset.qltdPreviousDisabled === '1';
        delete element.dataset.qltdPreviousDisabled;
      }
    });
  }

  function renderPositions() {
    const deptSelect = document.getElementById('qltdRegistrationDept');
    const positionSelect = document.getElementById('qltdRegistrationPosition');
    const submit = document.getElementById('qltdRegistrationSubmit');
    if (!deptSelect || !positionSelect || !submit) return;
    const positions = buildRegistrationPositions(profiles, deptSelect.value);
    positionSelect.innerHTML = '<option value="">Chọn Vị trí</option>';
    positions.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.empCode;
      option.textContent = item.label;
      positionSelect.appendChild(option);
    });
    if (positions.length === 1) positionSelect.value = positions[0].empCode;
    positionSelect.disabled = positions.length === 0;
    submit.disabled = !positionSelect.value;
  }

  function renderLookupResults(result) {
    profiles = Array.isArray(result?.profiles) ? result.profiles : [];
    const departments = buildRegistrationDepartments(profiles);
    const deptSelect = document.getElementById('qltdRegistrationDept');
    const positionSelect = document.getElementById('qltdRegistrationPosition');
    const submit = document.getElementById('qltdRegistrationSubmit');
    if (!deptSelect || !positionSelect || !submit) return;
    deptSelect.innerHTML = '<option value="">Chọn Phòng/Ban</option>';
    departments.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.deptCode;
      option.textContent = item.deptName;
      deptSelect.appendChild(option);
    });
    deptSelect.disabled = departments.length === 0;
    positionSelect.innerHTML = '<option value="">Chọn Vị trí</option>';
    positionSelect.disabled = true;
    submit.disabled = true;
    if (profiles.length === 1) {
      deptSelect.value = profiles[0].deptCode;
      renderPositions();
      setStatus('Đã tìm thấy một hồ sơ phù hợp.', 'success');
    } else {
      setStatus('Có nhiều hồ sơ trùng tên, vui lòng chọn đúng Phòng/Ban và Vị trí.');
    }
  }

  async function handleLookup() {
    if (lookupInFlight) return;
    const fullName = String(document.getElementById('qltdRegistrationName')?.value || '').trim();
    if (!fullName) {
      setStatus('Vui lòng nhập họ và tên.', 'error');
      return;
    }
    lookupInFlight = true;
    setBusy(true);
    setStatus('Đang tra cứu hồ sơ nhân sự...');
    try {
      const result = await options.lookup(fullName);
      if (!result?.success) throw result;
      renderLookupResults(result);
    } catch (error) {
      profiles = [];
      renderLookupResults({ profiles: [] });
      setStatus(getRegistrationErrorMessage(error), 'error');
    } finally {
      lookupInFlight = false;
      setBusy(false);
      const deptSelect = document.getElementById('qltdRegistrationDept');
      if (deptSelect) {
        deptSelect.disabled = buildRegistrationDepartments(profiles).length === 0;
        if (deptSelect.value) renderPositions();
      }
      const submit = document.getElementById('qltdRegistrationSubmit');
      if (submit) submit.disabled = !document.getElementById('qltdRegistrationPosition')?.value;
    }
  }

  async function handleRegister() {
    if (registrationInFlight) return;
    const empCode = String(document.getElementById('qltdRegistrationPosition')?.value || '').trim();
    if (!empCode) {
      setStatus('Vui lòng chọn đúng Phòng/Ban và Vị trí.', 'error');
      return;
    }
    registrationInFlight = true;
    setBusy(true);
    setStatus('Đang hoàn tất đăng ký...');
    try {
      const result = await options.register(empCode);
      if (!result?.success) throw result;
      setStatus('Đăng ký thành công.', 'success');
      await options.onRegistered(result);
    } catch (error) {
      setStatus(getRegistrationErrorMessage(error), 'error');
      registrationInFlight = false;
      setBusy(false);
    }
  }

  function show(user) {
    ensureStyles();
    hide();
    profiles = [];
    currentUser = user;
    const gate = document.createElement('section');
    gate.id = REGISTRATION_GATE_ID;
    gate.className = 'qltd-registration-gate';
    gate.innerHTML = `
      <div class="qltd-registration-card">
        <p>Entiz Project 360</p>
        <h2>Hoàn tất thông tin tài khoản</h2>
        <p>Tra cứu hồ sơ nhân sự để hệ thống tự xác định Phòng/Ban và quyền truy cập.</p>
        <div class="qltd-registration-field"><label for="qltdRegistrationEmail">Gmail đang đăng nhập</label><input id="qltdRegistrationEmail" readonly></div>
        <div class="qltd-registration-field"><label for="qltdRegistrationName">Họ và tên</label><input id="qltdRegistrationName" autocomplete="name"></div>
        <div class="qltd-registration-actions"><button id="qltdRegistrationLookup" class="qltd-registration-primary" type="button">Tra cứu</button></div>
        <div class="qltd-registration-grid">
          <div class="qltd-registration-field"><label for="qltdRegistrationDept">Phòng/Ban</label><select id="qltdRegistrationDept" disabled><option value="">Chọn Phòng/Ban</option></select></div>
          <div class="qltd-registration-field"><label for="qltdRegistrationPosition">Vị trí</label><select id="qltdRegistrationPosition" disabled><option value="">Chọn Vị trí</option></select></div>
        </div>
        <p id="qltdRegistrationStatus" class="qltd-registration-status" role="status"></p>
        <div class="qltd-registration-actions">
          <button id="qltdRegistrationSignOut" class="qltd-registration-secondary" type="button">Đăng xuất</button>
          <button id="qltdRegistrationSubmit" class="qltd-registration-primary" type="button" disabled>Hoàn tất đăng ký</button>
        </div>
      </div>
    `;
    document.body.appendChild(gate);
    gate.querySelector('#qltdRegistrationEmail').value = currentUser?.email || '';
    gate.querySelector('#qltdRegistrationName').value = currentUser?.displayName || '';
    gate.querySelector('#qltdRegistrationLookup').addEventListener('click', handleLookup);
    gate.querySelector('#qltdRegistrationDept').addEventListener('change', renderPositions);
    gate.querySelector('#qltdRegistrationPosition').addEventListener('change', () => {
      gate.querySelector('#qltdRegistrationSubmit').disabled = !gate.querySelector('#qltdRegistrationPosition').value;
    });
    gate.querySelector('#qltdRegistrationSubmit').addEventListener('click', handleRegister);
    gate.querySelector('#qltdRegistrationSignOut').addEventListener('click', () => options.onSignOut());
  }

  return { show, hide };
}
