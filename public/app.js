const $ = id => document.getElementById(id);
let state, selected, providerLoaded = false;
async function request(url, body) {
  if (window.hostedDemo) return window.hostedDemo(url, body);
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const value = await response.json();
  if (!response.ok) throw Error(value.error || 'Request failed');
  return value;
}
function render() {
  $('connection').textContent = state.config.aiReady ? '● API đã cấu hình' : '○ DEMO · chưa cấu hình API';
  if (state.config.demoOnly) {
    $('mode').querySelector('option[value="live"]').disabled = true;
    $('mode').title = 'Container này chỉ hỗ trợ Demo; Live cần worker riêng.';
    $('provider-settings').hidden = true;
  }
  if (state.config.hostedDemo) {
    $('provider-settings').hidden = true;
    $('connection').textContent = 'VERCEL · DEMO ONLY · Không gọi API';
    $('mode').querySelector('option[value="live"]').disabled = true;
    $('mode').title = 'Live cần worker riêng; bản Vercel chỉ minh họa trong trình duyệt.';
    document.querySelector('.brand small').textContent = 'HOSTED DEMO';
    document.querySelector('footer').textContent = 'Vercel Demo · Không xử lý yêu cầu thật · Lịch sử chỉ trong phiên trang này · Live chạy trên worker riêng';
  }
  if (!providerLoaded && !state.config.hostedDemo) {
    if (state.config.protocol) $('protocol').value = state.config.protocol;
    if (state.config.baseUrl) $('base-url').value = state.config.baseUrl;
    $('model').value = state.config.model || '';
    $('fast-model').value = state.config.fastModel || '';
    $('strong-model').value = state.config.strongModel || '';
    providerLoaded = true;
  }
  const task = state.tasks.find(t => t.id === selected) || state.tasks[0];
  $('tasks').replaceChildren(...state.tasks.map(t => {
    const button = document.createElement('button');
    button.textContent = `${t.mode.toUpperCase()} · ${t.prompt.slice(0, 65)} / ${t.status}`;
    button.onclick = () => { selected = t.id; render(); };
    return button;
  }));
  $('submit').disabled = state.tasks.some(t => ['running', 'queued', 'cancelling', 'publishing'].includes(t.status));
  if (!task) return;
  selected = task.id;
  $('cancel').disabled = !!state.config.hostedDemo || !['queued', 'running'].includes(task.status);
  $('status').textContent = task.status;
  $('task-title').textContent = task.prompt;
  const telemetry = task.telemetry || [];
  const cost = telemetry.length && telemetry.every(t => t.cost !== null) ? '$' + telemetry.reduce((n, t) => n + t.cost, 0).toFixed(5) : '—';
  $('metrics').replaceChildren(...[[task.tokens, 'Token thực tế'], [task.calls + ' / 6', 'Lượt gọi AI'], [cost, 'Chi phí ước tính']].map(([value, label]) => {
    const box = document.createElement('div'); box.className = 'metric';
    const strong = document.createElement('strong'); strong.textContent = value;
    const span = document.createElement('span'); span.textContent = label;
    box.append(strong, span); return box;
  }));
  $('context').textContent = JSON.stringify({ routing: task.routing, context: task.context, plan: task.plan }, null, 2);
  $('diff').textContent = task.diff || 'Chưa có thay đổi.';
  $('telemetry').textContent = telemetry.length ? JSON.stringify(telemetry, null, 2) : 'Chưa gọi API; chi phí chưa được đo.';
  $('events').textContent = (task.events || []).map(e => `${e.at} [${e.agent}] ${e.message}`).join('\n');
  $('gates').replaceChildren(...(task.test?.gates || []).map(g => {
    const item = document.createElement('div'); item.className = 'gate'; item.dataset.status = g.status;
    item.textContent = `${g.name} · ${g.status}`;
    const log = document.createElement('pre'); log.textContent = g.output; item.append(log); return item;
  }));
  if (!task.test?.gates) $('gates').textContent = task.test?.output || 'Chưa chạy kiểm tra.';
  $('review').textContent = task.error || task.review?.summary || 'Chờ kết quả kiểm tra.';
  $('publish').disabled = task.status !== 'ready' || task.mode !== 'live';
  $('pr').hidden = !task.pr;
  if (task.pr && /^https:\/\/github\.com\//.test(task.pr)) $('pr').href = task.pr;
}
async function refresh() {
  try { state = await request('/api/state'); render(); }
  catch (e) { $('connection').textContent = 'Mất kết nối'; $('error').textContent = e.message; }
}
$('mode').onchange = () => { $('repo').disabled = $('mode').value !== 'live'; $('repo').required = $('mode').value === 'live'; };
$('provider-form').onsubmit = async event => {
  event.preventDefault();
  $('provider-message').textContent = '';
  try {
    await request('/api/provider', { protocol: $('protocol').value, baseUrl: $('base-url').value, apiKey: $('api-key').value,
      model: $('model').value, fastModel: $('fast-model').value, strongModel: $('strong-model').value });
    $('api-key').value = '';
    $('provider-message').textContent = 'Đã lưu cấu hình. Chưa kiểm tra kết nối tới nhà cung cấp.';
    await refresh();
  } catch (e) { $('provider-message').textContent = e.message; }
};
$('task-form').onsubmit = async event => {
  event.preventDefault(); $('error').textContent = ''; $('submit').disabled = true;
  try {
    const task = await request('/api/tasks', { prompt: $('prompt').value, repo: $('repo').value, mode: $('mode').value, complexity: $('complexity').value });
    selected = task.id;
  } catch (e) { $('error').textContent = e.message; }
  await refresh();
};
$('publish').onclick = async () => {
  if (!confirm('Đã xem diff? Thao tác này sẽ commit, push branch và tạo draft PR trên GitHub.')) return;
  $('publish').disabled = true;
  try { await request(`/api/tasks/${selected}/publish`, {}); }
  catch (e) { $('error').textContent = e.message; }
  await refresh();
};
$('cancel').onclick = async () => {
  $('cancel').disabled = true;
  try { await request(`/api/tasks/${selected}/cancel`, {}); }
  catch (e) { $('error').textContent = e.message; }
  await refresh();
};
void refresh();
setInterval(refresh, 2000);
