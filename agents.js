const validators = {
  Planner(value) {
    return Array.isArray(value.paths) && value.paths.length <= 8 && value.paths.every(path => typeof path === 'string');
  },
  Coder(value) {
    return Array.isArray(value.edits) && value.edits.length > 0 && value.edits.length <= 20 && value.edits.every(edit =>
      edit && typeof edit === 'object' && typeof edit.path === 'string' && typeof edit.before === 'string' && typeof edit.after === 'string');
  },
  Reviewer(value) {
    return typeof value.approved === 'boolean' && typeof value.summary === 'string';
  },
};

export function validateAgentOutput(role, value) {
  if (!validators[role]) throw Error(`Vai trò AI không hợp lệ: ${role}`);
  if (!value || typeof value !== 'object' || Array.isArray(value) || !validators[role](value)) {
    throw Error(`Đầu ra ${role} không hợp lệ`);
  }
  return value;
}
