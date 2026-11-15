export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status}).`);
  return body;
}

export const json = (value) => ({ method: 'POST', body: JSON.stringify(value) });
export const putJson = (method, value) => ({ method, body: JSON.stringify(value) });
