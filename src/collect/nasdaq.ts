/**
 * Nasdaq — 미국(US) 실적 일정·직전 분기 결과 수집. 키 불필요.
 *
 * FMP 무료 티어는 일부 종목(AAPL 등)만 허용해서 대부분의 관심종목이 402 로 막힌다.
 * 그 공백을 메우는 대체 소스. 두 엔드포인트를 쓴다:
 *   GET /api/calendar/earnings?date=YYYY-MM-DD
 *     → 그날 발표 예정인 전 종목. 관심종목만 걸러 "다음 실적일 + EPS 컨센" 을 얻는다.
 *       같은 응답에서 시총 상위 대형주도 함께 추려(market.majorEarnings) 브리핑
 *       맨 앞 "오늘의 시장" 섹션에 쓴다 — 추가 요청 없이 재활용.
 *       **지난 날짜도 함께 훑는다**: 같은 엔드포인트가 지난 날짜엔 실제 EPS(eps)를 채워 주는데,
 *       미래만 보면 발표가 끝난 순간 목록에서 사라져 "그래서 어떻게 나왔는데?" 를 못 쓴다.
 *       (예정 행엔 lastYearEPS 가 붙어 와 전년비 기대치를, 발표된 행엔 실제 EPS 가 온다.)
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
import { fetchJson, daysAgo, isoDate, log, surprisePct } from './common';

/** 앞으로 며칠치 실적 캘린더를 훑을지. ROUTINE 은 "임박한 것만" 쓰므로 3주면 충분. */
const CALENDAR_DAYS = 21;
/** 직전 분기 결과를 얼마나 과거까지 인정할지 (fmp.ts 와 동일 기준). */
const PAST_DAYS = 100;
/** 시장 섹션의 "주요 기업 실적": 앞으로 며칠치까지 보여줄지. */
const MAJOR_DAYS = 7;
/**
 * 이미 발표된 결과를 며칠치(영업일) 거슬러 볼지.
 * 주말 게이트 때문에 월요일 아침엔 금·목요일 발표분이 여기 걸린다.
 */
const MAJOR_PAST_DAYS = 2;
/** 대형주 기준 시총(USD). 이보다 작으면 시장 전체 이슈로 보기 어렵다. */
const MAJOR_MIN_CAP = 100_000_000_000;
/** 시장 섹션에 담을 최대 건수 (시총 상위부터) — 예정 일정. */
const MAJOR_LIMIT = 15;
/** 같은 기준, 이미 발표된 결과. 예정 건과 자리를 다투지 않게 따로 잡는다. */
const MAJOR_REPORTED_LIMIT = 6;

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
      /** 발표가 끝난 날짜에만 채워져 온다. 예정 행엔 키 자체가 없다. */
      eps?: string;
      /** 예정 행에만 온다 — 작년 같은 분기 EPS. */
      lastYearEPS?: string;
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

/** 어제부터 거슬러 n영업일(주말 제외). 오래된 날짜가 앞에 오도록 돌려준다. */
function pastWeekdays(n: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n + 4 && out.length < n; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(isoDate(d));
  }
  return out.reverse();
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
  // KST 아침에 돌면 UTC 로는 아직 전날이라, upcomingWeekdays 의 첫날이 곧 "방금 장이 끝난 날" 이다.
  // 그날 장마감 후 발표분은 이 시점에 이미 eps 가 채워져 온다 — 그래서 날짜가 아니라 eps 유무로 판정한다.
  const today = isoDate(new Date());

  // 1) 실적 캘린더 — 지난 며칠(결과) + 향후(일정) 을 날짜별로 훑어 관심종목만 추린다.
  for (const date of [...pastWeekdays(MAJOR_PAST_DAYS), ...upcomingWeekdays(calendarDays)]) {
    try {
      const data = await fetchJson<CalendarResp>(
        `https://api.nasdaq.com/api/calendar/earnings?date=${date}`,
        { headers: UA }
      );
      for (const row of data.data?.rows ?? []) {
        const epsEstimated = money(row.epsForecast);
        const epsActual = money(row.eps);
        const reported = epsActual !== null || date < today;

        // 같은 응답에서 대형주도 추린다(시장 섹션용) — 관심종목 여부와 무관.
        const cap = money(row.marketCap);
        if (date <= majorUntil && row.symbol && cap !== null && cap >= MAJOR_MIN_CAP) {
          majorEarnings.push({
            symbol: row.symbol,
            name: row.name ?? row.symbol,
            eventDate: date,
            when: whenLabel(row.time),
            marketCap: cap,
            epsEstimated,
            reported,
            epsActual,
            surprisePercent: surprisePct(epsActual, epsEstimated),
            epsLastYear: money(row.lastYearEPS),
          });
        }
        const ticker = want.get((row.symbol ?? '').toUpperCase());
        if (!ticker) continue;
        earnings.push({
          ticker,
          market: 'US',
          eventDate: date,
          period: row.fiscalQuarterEnding ?? null,
          epsEstimated,
          epsActual,
          surprisePercent: surprisePct(epsActual, epsEstimated),
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
      const epsEstimated = money(latest.consensusForecast);
      const epsActual = money(latest.eps);
      earnings.push({
        ticker: t.ticker,
        market: 'US',
        eventDate: reported,
        period: latest.fiscalQtrEnd ?? null,
        epsEstimated,
        epsActual,
        surprisePercent: surprisePct(epsActual, epsEstimated),
        currency: 'USD',
      });
    } catch (e) {
      log('nasdaq', `${t.ticker} 직전실적 실패: ${(e as Error).message}`);
    }
  }

  // 시총 상위부터, 너무 길지 않게 자른다. 발표된 결과와 예정 일정을 따로 자른 뒤
  // "어젯밤 결과 → 앞으로의 일정" 순으로 붙인다 — 브리핑에 쓰는 순서 그대로.
  const byCap = (a: MajorEarnings, b: MajorEarnings) => (b.marketCap ?? 0) - (a.marketCap ?? 0);
  const done = majorEarnings.filter((e) => e.reported).sort(byCap).slice(0, MAJOR_REPORTED_LIMIT);
  const upcoming = majorEarnings.filter((e) => !e.reported).sort(byCap).slice(0, MAJOR_LIMIT);
  const major = [...done, ...upcoming];

  log(
    'nasdaq',
    `US 실적 ${earnings.length}건 · 대형주 발표결과 ${done.length}건 / 예정 ${upcoming.length}건 수집`
  );
  return { earnings, market: { majorEarnings: major } };
};

export default nasdaq;
