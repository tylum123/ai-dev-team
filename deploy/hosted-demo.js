// This adapter is included only in the static Vercel build, never local Live mode.
(() => {
  const tasks = [];
  window.hostedDemo = async (url, body) => {
    if (url === '/api/state' && !body) return { tasks, config: { aiReady: false, hostedDemo: true, maxCalls: 0 } };
    if (url !== '/api/tasks' || body?.mode !== 'demo') throw Error('Bản Vercel chỉ chạy Demo. Live và GitHub PR cần worker riêng.');
    if (typeof body.prompt !== 'string' || body.prompt.trim().length < 8 || body.prompt.length > 4000) throw Error('Yêu cầu cần từ 8 đến 4000 ký tự.');
    const task = {
      id: crypto.randomUUID(), mode: 'demo', prompt: body.prompt.trim(), status: 'demo_complete',
      calls: 0, tokens: 0, created: new Date().toISOString(),
      context: { note: 'Mẫu minh họa cố định; không đọc repository hoặc xử lý yêu cầu thật.' },
      diff: 'diff --git a/src/search.js b/src/search.js\n--- a/src/search.js\n+++ b/src/search.js\n+export function search(items, query = "") {\n+  const term = query.trim().toLowerCase();\n+  return items.filter(item => item.name.toLowerCase().includes(term));\n+}',
      test: { passed: null, output: 'MÔ PHỎNG — chưa chạy test, lint, TypeScript hoặc build.' },
      review: { approved: null, summary: 'Demo miễn gọi API. Không tạo branch, sửa repository hoặc tạo PR.' },
      events: [{ at: new Date().toISOString(), agent: 'Demo', message: 'Chạy hoàn toàn trong trình duyệt; lịch sử mất khi tải lại trang.' }],
    };
    tasks.unshift(task);
    if (tasks.length > 30) tasks.pop();
    return task;
  };
})();
