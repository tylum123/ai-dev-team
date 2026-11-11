import fs from 'node:fs/promises';
import path from 'node:path';

const protocols = new Set(['responses', 'chat_completions']);
export function validateProvider(input, previous = {}) {
  previous ||= {};
  const protocol = input.protocol;
  if (!protocols.has(protocol)) throw Error('Chọn giao thức API hợp lệ.');
  let url;
  try { url = new URL(input.baseUrl); } catch { throw Error('Base URL không hợp lệ.'); }
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw Error('Base URL phải dùng HTTPS hoặc HTTP trên localhost và không chứa thông tin đăng nhập.');
  }
  const model = typeof input.model === 'string' ? input.model.trim() : '';
  const fastModel = typeof input.fastModel === 'string' ? input.fastModel.trim() : '';
  const strongModel = typeof input.strongModel === 'string' ? input.strongModel.trim() : '';
  if (!model || [model, fastModel, strongModel].some(x => x.length > 200 || /[\r\n]/.test(x))) throw Error('Nhập tên model hợp lệ.');
  const apiKey = typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey.trim() : previous.apiKey;
  if (typeof apiKey !== 'string' || !apiKey || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw Error('Nhập API key hợp lệ.');
  if (previous.apiKey && !input.apiKey?.trim() && previous.baseUrl && previous.baseUrl !== url.href.replace(/\/$/, '')) {
    throw Error('Nhập lại API key khi đổi base URL.');
  }
  return { protocol, baseUrl: url.href.replace(/\/$/, ''), model, fastModel, strongModel, apiKey };
}

export function publicProvider(config) {
  if (!config) return { aiReady: false };
  const { protocol, baseUrl, model, fastModel, strongModel } = config;
  return { aiReady: true, protocol, baseUrl, model, fastModel, strongModel };
}

export async function loadProvider(data, env = process.env) {
  try { return validateProvider(JSON.parse(await fs.readFile(path.join(data, 'provider.json'), 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) return null;
  return validateProvider({ protocol: 'responses', baseUrl: 'https://api.openai.com/v1', apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL, fastModel: env.OPENAI_MODEL_FAST, strongModel: env.OPENAI_MODEL_STRONG });
}

export async function saveProvider(data, input, previous) {
  const config = validateProvider(input, previous);
  const temp = path.join(data, 'provider.tmp');
  await fs.writeFile(temp, JSON.stringify(config), { mode: 0o600 });
  await fs.rename(temp, path.join(data, 'provider.json'));
  return config;
}
