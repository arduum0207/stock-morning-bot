/** 수집 스크립트 공통 유틸. 외부 의존성 없음(Node 20+ 내장 fetch 사용). */

/**
 * SEC EDGAR 등은 연락처(이메일)가 포함된 User-Agent를 요구한다.
 * 연락처가 없으면 SEC가 403으로 차단하므로 기본값에도 이메일 형태를 포함한다.
 * 실제 사용 시 COLLECT_USER_AGENT 환경변수에 "내이름 내이메일" 로 넣는 걸 권장.
 */
export const SOURCE_UA =
  process.env.COLLECT_USER_AGENT || 'stock-morning-bot admin@example.com';

/** YYYYMMDD → YYYY-MM-DD */
export function ymd8ToIso(s: string): string {
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

/** 임의 날짜 문자열 → ISO8601 (실패 시 원본 유지) */
export function toIso(s: string | undefined | null): string {
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

/** N일 전 Date */
export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** fetch + 타임아웃 + JSON. 실패 시 throw. */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/** fetch + 타임아웃 + text (RSS/XML 용). */
export async function fetchText(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export function log(tag: string, msg: string): void {
  console.log(`[collect:${tag}] ${msg}`);
}
