const STYLE_ID = 'qltdGanttExecutionTooltipStyle';
const TOOLTIP_ID = 'qltdGanttExecutionTooltip';
const GANTT_CONTAINER_ID = 'web07GanttContainer';
const SHOW_DELAY_MS = 220;

let activeCell = null;
let activeTaskId = '';
let showTimer = null;
let lastPointer = { x: 0, y: 0 };
let installed = false;

export function formatGanttExecutionDate(value) {
  if (!value) return '';

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return formatDateParts(value.getDate(), value.getMonth() + 1, value.getFullYear());
  }

  const raw = String(value).trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  const viMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (viMatch) {
    const year = viMatch[3].length === 2 ? `20${viMatch[3]}` : viMatch[3];
    return `${viMatch[1].padStart(2, '0')}/${viMatch[2].padStart(2, '0')}/${year}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateParts(parsed.getDate(), parsed.getMonth() + 1, parsed.getFullYear());
  }

  return raw;
}

function formatDateParts(day, month, year) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year)}`;
}

export function normalizePredecessorLookupToken(value) {
  let token = String(value || '').trim();
  if (!token) return '';

  token = token
    .replace(/^[\s([{]+/, '')
    .replace(/[\s)\]}]+$/, '')
    .trim();

  token = token.replace(
    /\s*(FS|SS|FF|SF)\s*(?:[+-]\s*\d+\s*(?:D|DAY|DAYS|NGÀY)?)?\s*$/i,
    ''
  ).trim();

  return token;
}

function normalizeLookupKey(value) {
  return String(value || '').trim().toUpperCase();
}

function buildTaskTextLookup(gantt) {
  const lookup = new Map();
  if (!gantt || typeof gantt.eachTask !== 'function') return lookup;

  gantt.eachTask((candidate) => {
    if (!candidate || !candidate.text) return;
    [
      candidate.id,
      candidate.code,
      candidate.taskCode,
      candidate.masterTaskCode,
      candidate.refId,
      candidate.ref,
      candidate.wbs
    ].forEach((key) => {
      const normalized = normalizeLookupKey(key);
      if (normalized && !lookup.has(normalized)) {
        lookup.set(normalized, String(candidate.text).trim());
      }
    });
  });

  return lookup;
}

function uniqueNonBlank(values) {
  const seen = new Set();
  const result = [];
  (values || []).forEach((value) => {
    const text = String(value || '').trim();
    const key = text.toLocaleUpperCase('vi-VN');
    if (!text || seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result;
}

export function collectGanttPredecessorNames(gantt, task) {
  if (!gantt || !task) return [];

  const names = [];
  const targetId = String(task.id ?? '');

  if (typeof gantt.getLinks === 'function' && typeof gantt.getTask === 'function') {
    let links = [];
    try {
      links = gantt.getLinks() || [];
    } catch (error) {
      links = [];
    }

    links.forEach((link) => {
      if (!link || String(link.target ?? '') !== targetId) return;
      try {
        const sourceTask = gantt.getTask(link.source);
        if (sourceTask && sourceTask.text) names.push(sourceTask.text);
      } catch (error) {
        // Không đưa ID kỹ thuật ra giao diện nếu không resolve được source task.
      }
    });
  }

  const lookup = buildTaskTextLookup(gantt);
  const raw = String(task.predecessorRaw || '').trim();
  if (raw) {
    raw.split(/[,;\n|]+/).forEach((part) => {
      const token = normalizePredecessorLookupToken(part);
      if (!token) return;
      const resolved = lookup.get(normalizeLookupKey(token));
      if (resolved) names.push(resolved);
    });
  }

  return uniqueNonBlank(names);
}

function signedDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days)) return '';
  if (days === 0) return '0 ngày';
  return `${days > 0 ? '+' : ''}${days} ngày`;
}

export function buildGanttBaselineNoteModel(task) {
  const comparison = task && task._qltdBaselineComparison;
  if (!comparison) return null;

  const baseline = comparison.baseline || {};
  const version = String(comparison.version || '').trim();
  const baselineStart = formatGanttExecutionDate(baseline.baselineStart || '');
  const baselineEnd = formatGanttExecutionDate(baseline.baselineEnd || '');
  const currentStart = formatGanttExecutionDate(comparison.currentStart || '');
  const currentEnd = formatGanttExecutionDate(comparison.currentEnd || '');
  const startDelta = signedDays(comparison.startDeltaDays);
  const endDelta = signedDays(comparison.endDeltaDays);
  const label = String(comparison.label || '').trim();

  const rows = [];
  if (baselineStart || baselineEnd) rows.push({ label: 'Kế hoạch gốc', value: [baselineStart, baselineEnd].filter(Boolean).join(' → ') });
  if (currentStart || currentEnd) rows.push({ label: 'Hiện hành', value: [currentStart, currentEnd].filter(Boolean).join(' → ') });
  if (startDelta) rows.push({ label: 'Chênh bắt đầu', value: startDelta });
  if (endDelta) rows.push({ label: 'Chênh kết thúc', value: endDelta });
  if (label) rows.push({ label: 'Đánh giá', value: label });

  if (!rows.length && !version) return null;
  return {
    title: version ? `So sánh kế hoạch gốc — ${version}` : 'So sánh kế hoạch gốc',
    rows
  };
}

export function buildGanttExecutionNoteModel(gantt, task, options = {}) {
  const rows = [];

  const status = String(task && task.status || '').trim();
  const actualStart = formatGanttExecutionDate(task && task.actualStart || '');
  const actualEnd = formatGanttExecutionDate(task && (task.actualEnd || task.actualFinish) || '');
  const predecessors = collectGanttPredecessorNames(gantt, task);
  const note = String(task && (task.updateNote || task.note) || '').trim();

  if (status) rows.push({ label: 'Trạng thái', value: status });
  if (actualStart) rows.push({ label: 'Bắt đầu thực tế', value: actualStart });
  if (actualEnd) rows.push({ label: 'Hoàn thành thực tế', value: actualEnd });
  if (predecessors.length) rows.push({ label: 'Công việc liên kết', values: predecessors });
  if (note) rows.push({ label: 'Ghi chú cập nhật', value: note, multiline: true });

  return {
    rows,
    baseline: options.includeBaseline ? buildGanttBaselineNoteModel(task) : null
  };
}

function isBaselineComparisonVisible(gantt) {
  const columns = gantt && gantt.config && Array.isArray(gantt.config.columns)
    ? gantt.config.columns
    : [];
  return columns.some((column) => column && column.name === 'baselineComparison');
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gantt_tooltip {
      display: none !important;
    }

    #${TOOLTIP_ID} {
      position: fixed;
      z-index: 2147483000;
      display: none;
      max-width: min(380px, calc(100vw - 24px));
      padding: 10px 12px;
      border: 1px solid #d0d5dd;
      border-radius: 8px;
      background: #ffffff;
      color: #1f2937;
      box-shadow: 0 10px 28px rgba(15, 23, 42, .18);
      font: 12px/1.45 Inter, "Segoe UI", Arial, sans-serif;
      pointer-events: none;
      white-space: normal;
    }

    #${TOOLTIP_ID}.is-visible {
      display: block;
    }

    #${TOOLTIP_ID} .qltd-gantt-note-row + .qltd-gantt-note-row {
      margin-top: 5px;
    }

    #${TOOLTIP_ID} .qltd-gantt-note-label {
      font-weight: 700;
      color: #344054;
    }

    #${TOOLTIP_ID} .qltd-gantt-note-value {
      color: #101828;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    #${TOOLTIP_ID} .qltd-gantt-note-list {
      margin: 3px 0 0 16px;
      padding: 0;
    }

    #${TOOLTIP_ID} .qltd-gantt-note-baseline {
      margin-top: 9px;
      padding-top: 8px;
      border-top: 1px solid #e4e7ec;
    }

    #${TOOLTIP_ID} .qltd-gantt-note-baseline-title {
      margin-bottom: 5px;
      font-weight: 700;
      color: #175cd3;
    }
  `;
  document.head.appendChild(style);
}

function ensureTooltipElement() {
  let tooltip = document.getElementById(TOOLTIP_ID);
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = TOOLTIP_ID;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tooltip);
  return tooltip;
}

function appendRow(parent, row) {
  const wrapper = document.createElement('div');
  wrapper.className = 'qltd-gantt-note-row';

  const label = document.createElement('span');
  label.className = 'qltd-gantt-note-label';
  label.textContent = `${row.label}: `;
  wrapper.appendChild(label);

  if (Array.isArray(row.values)) {
    const list = document.createElement('ul');
    list.className = 'qltd-gantt-note-list';
    row.values.forEach((value) => {
      const item = document.createElement('li');
      item.className = 'qltd-gantt-note-value';
      item.textContent = value;
      list.appendChild(item);
    });
    wrapper.appendChild(list);
  } else {
    const value = document.createElement('span');
    value.className = 'qltd-gantt-note-value';
    value.textContent = row.value || '';
    wrapper.appendChild(value);
  }

  parent.appendChild(wrapper);
}

function renderTooltipModel(tooltip, model) {
  tooltip.replaceChildren();
  (model.rows || []).forEach((row) => appendRow(tooltip, row));

  if (model.baseline) {
    const section = document.createElement('div');
    section.className = 'qltd-gantt-note-baseline';

    const title = document.createElement('div');
    title.className = 'qltd-gantt-note-baseline-title';
    title.textContent = model.baseline.title;
    section.appendChild(title);

    (model.baseline.rows || []).forEach((row) => appendRow(section, row));
    tooltip.appendChild(section);
  }
}

function hideTooltip() {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  activeCell = null;
  activeTaskId = '';
  const tooltip = typeof document !== 'undefined' ? document.getElementById(TOOLTIP_ID) : null;
  if (!tooltip) return;
  tooltip.classList.remove('is-visible');
  tooltip.setAttribute('aria-hidden', 'true');
}

function positionTooltip(tooltip, clientX, clientY) {
  const margin = 12;
  const offset = 14;
  tooltip.style.left = `${clientX + offset}px`;
  tooltip.style.top = `${clientY + offset}px`;

  const rect = tooltip.getBoundingClientRect();
  let left = clientX + offset;
  let top = clientY + offset;

  if (left + rect.width > window.innerWidth - margin) {
    left = Math.max(margin, clientX - rect.width - offset);
  }
  if (top + rect.height > window.innerHeight - margin) {
    top = Math.max(margin, clientY - rect.height - offset);
  }

  tooltip.style.left = `${Math.max(margin, left)}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function getNameCellContext(target) {
  const container = document.getElementById(GANTT_CONTAINER_ID);
  if (!container || !target || !(target instanceof Element) || !container.contains(target)) return null;

  const cell = target.closest('.gantt_cell');
  if (!cell || !cell.closest('.gantt_grid_data')) return null;
  if (!cell.querySelector('.gantt_tree_content')) return null;

  const row = cell.closest('.gantt_row');
  if (!row) return null;

  const taskId = row.getAttribute('task_id') || row.getAttribute('data-task-id') || row.dataset.taskId || '';
  const gantt = window.gantt;
  if (!taskId || !gantt || typeof gantt.getTask !== 'function') return null;

  try {
    const task = gantt.getTask(taskId);
    if (!task) return null;
    return { cell, gantt, task, taskId: String(taskId) };
  } catch (error) {
    return null;
  }
}

function scheduleTooltip(context) {
  if (showTimer) clearTimeout(showTimer);
  activeCell = context.cell;
  activeTaskId = context.taskId;

  showTimer = setTimeout(() => {
    showTimer = null;
    if (activeCell !== context.cell || activeTaskId !== context.taskId || !document.contains(context.cell)) return;

    const includeBaseline = isBaselineComparisonVisible(context.gantt);
    const model = buildGanttExecutionNoteModel(context.gantt, context.task, { includeBaseline });
    if (!(model.rows || []).length && !model.baseline) {
      hideTooltip();
      return;
    }

    const tooltip = ensureTooltipElement();
    renderTooltipModel(tooltip, model);
    tooltip.classList.add('is-visible');
    tooltip.setAttribute('aria-hidden', 'false');
    positionTooltip(tooltip, lastPointer.x, lastPointer.y);
  }, SHOW_DELAY_MS);
}

function onPointerOver(event) {
  lastPointer = { x: event.clientX, y: event.clientY };
  const context = getNameCellContext(event.target);
  if (!context) {
    hideTooltip();
    return;
  }
  if (activeCell === context.cell && activeTaskId === context.taskId) return;
  scheduleTooltip(context);
}

function onPointerMove(event) {
  lastPointer = { x: event.clientX, y: event.clientY };
  const tooltip = document.getElementById(TOOLTIP_ID);
  if (tooltip && tooltip.classList.contains('is-visible')) {
    positionTooltip(tooltip, event.clientX, event.clientY);
  }
}

function onPointerOut(event) {
  if (!activeCell) return;
  const related = event.relatedTarget;
  if (related instanceof Node && activeCell.contains(related)) return;
  const fromCell = event.target instanceof Element ? event.target.closest('.gantt_cell') : null;
  if (fromCell === activeCell) hideTooltip();
}

export function installGanttExecutionTooltip() {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  ensureStyles();
  ensureTooltipElement();

  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('scroll', hideTooltip, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideTooltip();
  });
  window.addEventListener('blur', hideTooltip);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  installGanttExecutionTooltip();
}
