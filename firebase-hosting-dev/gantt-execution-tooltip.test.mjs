import assert from 'node:assert/strict';
import {
  buildGanttBaselineNoteModel,
  buildGanttExecutionNoteModel,
  collectGanttPredecessorNames,
  formatGanttExecutionDate,
  normalizePredecessorLookupToken
} from './gantt-execution-tooltip.js';

function mockGantt(tasks, links = []) {
  const taskMap = new Map(tasks.map((task) => [String(task.id), task]));
  return {
    config: { columns: [] },
    eachTask(callback) {
      tasks.forEach(callback);
    },
    getLinks() {
      return links;
    },
    getTask(id) {
      const task = taskMap.get(String(id));
      if (!task) throw new Error('Task not found');
      return task;
    }
  };
}

assert.equal(formatGanttExecutionDate('2027-01-11'), '11/01/2027');
assert.equal(formatGanttExecutionDate('3/7/27'), '03/07/2027');
assert.equal(normalizePredecessorLookupToken('C5.06-259FS+2'), 'C5.06-259');
assert.equal(normalizePredecessorLookupToken(' 324 SS - 3 ngày '), '324');

{
  const predecessor = { id: '324', code: 'C5.06-259', text: 'Hoàn thành thi công phần móng' };
  const target = { id: '325', text: 'Thi công phần thân', predecessorRaw: 'C5.06-259FS+2' };
  const gantt = mockGantt([predecessor, target], [{ source: '324', target: '325', type: '0' }]);
  assert.deepEqual(collectGanttPredecessorNames(gantt, target), ['Hoàn thành thi công phần móng']);
}

{
  const predecessor = { id: '324', code: 'C5.06-259', text: 'Hoàn thành thi công phần móng' };
  const target = { id: '325', text: 'Thi công phần thân', predecessorRaw: '324FS' };
  const gantt = mockGantt([predecessor, target], []);
  assert.deepEqual(collectGanttPredecessorNames(gantt, target), ['Hoàn thành thi công phần móng']);
}

{
  const target = { id: '325', text: 'Thi công phần thân', predecessorRaw: '999FS' };
  const gantt = mockGantt([target], []);
  assert.deepEqual(collectGanttPredecessorNames(gantt, target), []);
}

{
  const predecessor = { id: '324', text: 'Nghiệm thu móng' };
  const target = {
    id: '325',
    text: 'Thi công phần thân',
    status: 'Đang thực hiện',
    actualStart: '2027-01-11',
    actualEnd: '',
    predecessorRaw: '324FS',
    updateNote: 'Chậm 05 ngày do bàn giao mặt bằng'
  };
  const gantt = mockGantt([predecessor, target], []);
  const model = buildGanttExecutionNoteModel(gantt, target);
  assert.deepEqual(model.rows.map((row) => row.label), [
    'Trạng thái',
    'Bắt đầu thực tế',
    'Công việc liên kết',
    'Ghi chú cập nhật'
  ]);
  assert.deepEqual(model.rows.find((row) => row.label === 'Công việc liên kết').values, ['Nghiệm thu móng']);
  assert.equal(model.rows.some((row) => row.label === 'Hoàn thành thực tế'), false);
}

{
  const task = {
    _qltdBaselineComparison: {
      version: 'BL005',
      baseline: { baselineStart: '2027-01-01', baselineEnd: '2027-02-01' },
      currentStart: '2027-01-05',
      currentEnd: '2027-02-06',
      startDeltaDays: 4,
      endDeltaDays: 5,
      label: 'Chậm kết thúc'
    }
  };
  const model = buildGanttBaselineNoteModel(task);
  assert.equal(model.title, 'So sánh kế hoạch gốc — BL005');
  assert.equal(model.rows.find((row) => row.label === 'Chênh kết thúc').value, '+5 ngày');
}

console.log('gantt-execution-tooltip tests: PASS');
