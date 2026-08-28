const MS_BASE_URL = 'https://api.moysklad.ru/api/remap/1.2';

// МойСклад поддерживает и токен (Bearer), и логин/пароль (Basic).
// Токен из настроек аккаунта — более безопасный вариант (его можно отозвать
// отдельно от пароля сотрудника), поэтому используем его по умолчанию.
function authHeader(): string {
  const token = process.env.MS_API_TOKEN;
  if (token) return `Bearer ${token}`;

  const login = process.env.MS_API_LOGIN;
  const password = process.env.MS_API_PASSWORD;
  if (login && password) {
    const encoded = Buffer.from(`${login}:${password}`).toString('base64');
    return `Basic ${encoded}`;
  }

  throw new Error(
    'Не заданы учётные данные МойСклад: укажите MS_API_TOKEN, либо MS_API_LOGIN и MS_API_PASSWORD'
  );
}

async function msFetch(pathOrHref: string, init: RequestInit = {}) {
  const url = pathOrHref.startsWith('http') ? pathOrHref : `${MS_BASE_URL}${pathOrHref}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`МойСклад API ${res.status} ${url}: ${text.slice(0, 500)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function msGet(path: string) {
  return msFetch(path, { method: 'GET' });
}

// Для запросов по meta.href, который присылает сам МойСклад (полный URL).
export function msGetByHref(href: string) {
  return msFetch(href, { method: 'GET' });
}

export function msPost(path: string, body: unknown) {
  return msFetch(path, { method: 'POST', body: JSON.stringify(body) });
}

export function msPut(path: string, body: unknown) {
  return msFetch(path, { method: 'PUT', body: JSON.stringify(body) });
}
