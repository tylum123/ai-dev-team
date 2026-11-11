const transitions = {
  queued: ['running', 'cancelled', 'interrupted'],
  running: ['ready', 'needs_changes', 'demo_complete', 'cancelling', 'failed', 'interrupted'],
  cancelling: ['cancelled', 'failed', 'interrupted'],
  ready: ['publishing'],
  publishing: ['published', 'publish_failed', 'interrupted'],
};

export function transition(task, next) {
  if (!transitions[task.status]?.includes(next)) throw Error(`Chuyển trạng thái không hợp lệ: ${task.status} → ${next}`);
  task.status = next;
}

export function checkCancellation(task) {
  if (task.status === 'cancelling' || task.status === 'cancelled') {
    const error = Error('Tác vụ đã được hủy.');
    error.code = 'TASK_CANCELLED';
    throw error;
  }
}
