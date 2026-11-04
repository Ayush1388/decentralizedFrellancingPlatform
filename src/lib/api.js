export const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const TOKEN_KEY = "token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// body may be a plain object (sent as JSON) or FormData (sent as multipart).
export async function api(path, { method = "GET", body, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API}${path}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Cannot reach the server. Is the API running?", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message || "Something went wrong", res.status);
  return data;
}

// Like api(), but also returns the total count the server reports for a paged list.
export async function apiList(path, { signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API}${path}`, { headers, signal });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Cannot reach the server. Is the API running?", 0);
  }
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new ApiError(data.message || "Something went wrong", res.status);
  return { items: data, total: Number(res.headers.get("X-Total-Count")) || data.length };
}

export const imageUrl = (path) => (path ? `${API}${path}` : null);

// Opens a protected file (a resume) in a new tab. A plain link would not carry the token.
export async function openProtectedFile(path) {
  const tab = window.open("", "_blank");
  try {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).message || "Could not open the file", res.status);
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

// Fetches a protected file and saves it to disk.
export async function downloadProtectedFile(path, name = "download") {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).message || "Could not download the file", res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// A protected image as an object URL, for <img> tags that cannot send the login token themselves.
export async function fetchProtectedBlobUrl(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError("Could not load the file", res.status);
  return URL.createObjectURL(await res.blob());
}
