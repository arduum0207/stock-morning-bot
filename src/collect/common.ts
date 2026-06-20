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

const FETCH_TRIES = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch + 타임아웃 + 재시도. 일시 오류(네트워크 throw, HTTP 5xx)만 재시도한다.
 * 4xx(예: naver 403 차단, 잘못된 키)는 영구 오류라 즉시 throw — 헛재시도 방지.
 */
async function fetchWithRetry(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < FETCH_TRIES; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 15_000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      if (res.status >= 500 && i < FETCH_TRIES - 1) {
        await sleep(600 * (i + 1));
        continue; // 서버 일시 오류(예: DART 503) → 재시도
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      // HTTP 오류로 우리가 던진 Error는 재시도 안 함(4xx/마지막 5xx)
      if (e instanceof Error && e.message.startsWith('HTTP ')) throw e;
      if (i < FETCH_TRIES - 1) {
        await sleep(600 * (i + 1));
        continue; // 네트워크 throw → 재시도
      }
    }
  }
  throw lastErr ?? new Error(`fetch 실패: ${url}`);
}

/** fetch + 타임아웃 + 재시도 + JSON. 실패 시 throw. */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const res = await fetchWithRetry(url, init);
  return (await res.json()) as T;
}

/** fetch + 타임아웃 + 재시도 + text (RSS/XML 용). */
export async function fetchText(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<string> {
  const res = await fetchWithRetry(url, init);
  return await res.text();
}

export function log(tag: string, msg: string): void {
  console.log(`[collect:${tag}] ${msg}`);
}
