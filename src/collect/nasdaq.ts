/**
 * Nasdaq — 미국(US) 실적 일정·직전 분기 결과 수집. 키 불필요.
 *
 * FMP 무료 티어는 일부 종목(AAPL 등)만 허용해서 대부분의 관심종목이 402 로 막힌다.
 * 그 공백을 메우는 대체 소스. 두 엔드포인트를 쓴다:
 *   GET /api/calendar/earnings?date=YYYY-MM-DD
 *     → 그날 발표 예정인 전 종목. 관심종목만 걸러 "다음 실적일 + EPS 컨센" 을 얻는다.
 *       같은 응답에서 시총 상위 대형주도 함께 추려(market.majorEarnings) 브리핑
 *       맨 앞 "오늘의 시장" 섹션에 쓴다 — 추가 요청 없이 재활용.
 *   GET /api/company/{symbol}/earnings-surprise
 *     → 최근 보고된 분기의 실제 EPS vs 컨센서스.
 *
 * 브라우저 User-Agent 가 없으면 거부하므로 UA 를 붙인다.
 */
import type {
  WatchTicker,
  EarningsEvent,
  MajorEarnings,
  CollectResult,
  Collector,
} from '../types';
import { fetchJson, daysAgo, isoDate, log } from './common';

/** 앞으로 며칠치 실적 캘린더를 훑을지. ROUTINE 은 "임박한 것만" 쓰므로 3주면 충분. */
const CALENDAR_DAYS = 21;
/** 직전 분기 결과를 얼마나 과거까지 인정할지 (fmp.ts 와 동일 기준). */
const PAST_DAYS = 100;
/** 시장 섹션의 "주요 기업 실적": 앞으로 며칠치까지 보여줄지. */
const MAJOR_DAYS = 7;
/** 대형주 기준 시총(USD). 이보다 작으면 시장 전체 이슈로 보기 어렵다. */
const MAJOR_MIN_CAP = 100_000_000_000;
/** 시장 섹션에 담을 최대 건수 (시총 상위부터). */
const MAJOR_LIMIT = 15;

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json',
};

interface CalendarResp {
  data?: {
    rows?: Array<{
      symbol?: string;
      name?: string;
      time?: string;
      marketCap?: string;
      epsForecast?: string;
      fiscalQuarterEnding?: string;
    }> | null;
  } | null;
}

interface SurpriseResp {
  data?: {
    earningsSurpriseTable?: {
      rows?: Array<{
        fiscalQtrEnd?: string;
        dateReported?: string;
        eps?: number | string;
        consensusForecast?: number | string;
      }> | null;
    } | null;
  } | null;
}

/** "$2.72" / "($0.15)" / 1.79 → 2.72 / -0.15 / 1.79. 빈값·"N/A" → null */
function money(v: number | string | undefined | null): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const neg = /^\(.*\)$/.test(v.trim());
  const n = Number(v.replace(/[()$,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** "6/10/2026" → "2026-06-10". 형식이 다르면 null */
function usDateToIso(s: string | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s ?? '').trim());
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** "time-pre-market" → "장전" */
function whenLabel(time: string | undefined): string | null {
  if (!time) return null;
  if (time.includes('pre-market')) return '장전';
  if (time.includes('after-hours')) return '장마감 후';
  return null;
}

/** 오늘부터 n일간의 날짜(주말 제외) */
function upcomingWeekdays(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() + i * 86_400_000);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(isoDate(d));
  }
  return out;
}

const nasdaq: Collector = async (tickers: WatchTicker[]): Promise<CollectResult> => {
  const targets = tickers.filter((t) => t.market === 'US');
  const want = new Map(targets.map((t) => [t.ticker.toUpperCase(), t.ticker]));
  // 대형주 실적일정(시장 섹션)은 보유 종목과 무관하므로, US 종목이 하나도 없어도
  // 최소 MAJOR_DAYS 만큼은 캘린더를 훑는다.
  const calendarDays = targets.length === 0 ? MAJOR_DAYS : CALENDAR_DAYS;

  const earnings: EarningsEvent[] = [];
  const majorEarnings: MajorEarnings[] = [];
  const majorUntil = isoDate(new Date(Date.now() + MAJOR_DAYS * 86_400_000));

  // 1) 향후 실적 캘린더 — 날짜별로 훑어 관심종목만 추린다.
  for (const date of upcomingWeekdays(calendarDays)) {
    try {
      const data = await fetchJson<CalendarResp>(
        `https://api.nasdaq.com/api/calendar/earnings?date=${date}`,
        { headers: UA }
      );
      for (const row of data.data?.rows ?? []) {
        // 같은 응답에서 대형주도 추린다(시장 섹션용) — 관심종목 여부와 무관.
        const cap = money(row.marketCap);
        if (date <= majorUntil && row.symbol && cap !== null && cap >= MAJOR_MIN_CAP) {
          majorEarnings.push({
            symbol: row.symbol,
            name: row.name ?? row.symbol,
            eventDate: date,
            when: whenLabel(row.time),
            marketCap: cap,
            epsEstimated: money(row.epsForecast),
          });
        }
        const ticker = want.get((row.symbol ?? '').toUpperCase());
        if (!ticker) continue;
        earnings.push({
          ticker,
          market: 'US',
          eventDate: date,
          period: row.fiscalQuarterEnding ?? null,
          epsEstimated: money(row.epsForecast),
          epsActual: null,
          currency: 'USD',
        });
      }
    } catch (e) {
      log('nasdaq', `캘린더 ${date} 실패: ${(e as Error).message}`);
    }
  }

  // 2) 직전 분기 실제 실적 — 종목별로 가장 최근 보고 건만.
  const since = isoDate(daysAgo(PAST_DAYS));
  for (const t of targets) {
    try {
      const data = await fetchJson<SurpriseResp>(
        `https://api.nasdaq.com/api/company/${encodeURIComponent(t.ticker)}/earnings-surprise`,
        { headers: UA }
      );
      const latest = (data.data?.earningsSurpriseTable?.rows ?? [])[0];
      if (!latest) continue;
      const reported = usDateToIso(latest.dateReported);
      if (!reported || reported < since) continue;
      earnings.push({
        ticker: t.ticker,
        market: 'US',
        eventDate: reported,
        period: latest.fiscalQtrEnd ?? null,
        epsEstimated: money(latest.consensusForecast),
        epsActual: money(latest.eps),
        currency: 'USD',
      });
    } catch (e) {
      log('nasdaq', `${t.ticker} 직전실적 실패: ${(e as Error).message}`);
    }
  }

  // 시총 상위부터, 너무 길지 않게 자른다.
  majorEarnings.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  const major = majorEarnings.slice(0, MAJOR_LIMIT);

  log('nasdaq', `US 실적 ${earnings.length}건 · 대형주 실적일정 ${major.length}건 수집`);
  return { earnings, market: { majorEarnings: major } };
};

export default nasdaq;
