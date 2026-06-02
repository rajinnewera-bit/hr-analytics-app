const missingApiBaseUrlMessage =
  "Upload service is not configured. Set NEXT_PUBLIC_API_BASE_URL (or NEXT_PUBLIC_API_URL) to your backend URL in Vercel.";

function normalizeApiBaseUrl(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }
  return trimmedValue.replace(/\/+$/, "");
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function resolveApiBaseUrl(): string | null {
  const configuredValue = normalizeApiBaseUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL
  );
  if (configuredValue) {
    return configuredValue;
  }

  if (typeof window !== "undefined") {
    return isLocalHostname(window.location.hostname)
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : null;
  }

  return "http://127.0.0.1:8000";
}

export function getApiBaseUrlConfigurationMessage() {
  return missingApiBaseUrlMessage;
}

export function buildApiUrl(path: string): string {
  const apiBaseUrl = resolveApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error(missingApiBaseUrlMessage);
  }
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function parseApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await parseApiJson<T | { detail?: string }>(response);
  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string"
        ? data.detail
        : "Request failed.";
    throw new Error(detail);
  }
  return data as T;
}
