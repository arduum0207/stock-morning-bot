/**
 * 경제지표 캘린더 — Nasdaq. 키 불필요(브라우저 UA 필요).
 *   GET /api/calendar/economicevents?date=YYYY-MM-DD
 *     → 그날 발표되는 전 세계 지표. actual/consensus/previous 가 함께 온다.
 *
 * 어제(=간밤 미국장 결과) ~ 앞으로 3영업일만 본다. 전 세계를 다 담으면 노이즈라
 * COUNTRIES 의 주요국만 남기고, 국채 입찰·주간 집계처럼 시장 브리핑에 쓸모없는
 * 항목(NOISE)은 버린다.
 */
import type { CollectResult, Collector, EconomicEvent } from '../types';
import { fetchJson, isoDate, log } from './common';

const COUNTRIES = new Set([
  'United States',
  'South Korea',
  'Euro Zone',
  'China',
  'Japan',
  'Germany',
  'United Kingdom',
]);

/**
 * 매일 나오지만 브리핑에는 의미 없는 항목들. 국채 입찰·주간 소매판매 집계 등.
 * (CPI·고용·FOMC 같은 진짜 이벤트가 묻히지 않게 미리 걷어낸다.)
 */
const NOISE =
  /(Bill|Note|Bond) Auction|Redbook|Baker Hughes|Money Supply|MBA |Fed Balance Sheet|API Weekly|Cushing/i;

/** 어제부터 앞으로 며칠(영업일)까지 볼지. */
const FROM_DAYS = -1;
const TO_DAYS = 3;

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json',
};

interface EventsResp {
  data?: {
    rows?: Array<{
      gmt?: string;
      country?: string;
      eventName?: string;
      actual?: string;
      consensus?: string;
      previous?: string;
    }> | null;
  } | null;
}

/** "&nbsp;" · 공백만 있는 값 → null */
function val(v: string | undefined): string | null {
  const s = (v ?? '').replace(/&nbsp;/g, ' ').trim();
  return s === '' ? null : s;
}

/** from~to 일 사이의 영업일(주말 제외) 날짜 목록 */
function weekdayRange(from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    const d = new Date(Date.now() + i * 86_400_000);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(isoDate(d));
  }
  return out;
}

const econCalendar: Collector = async (): Promise<CollectResult> => {
  const economicEvents: EconomicEvent[] = [];

  for (const date of weekdayRange(FROM_DAYS, TO_DAYS)) {
    try {
      const data = await fetchJson<EventsResp>(
        `https://api.nasdaq.com/api/calendar/economicevents?date=${date}`,
        { headers: UA }
      );
      for (const row of data.data?.rows ?? []) {
        const country = (row.country ?? '').trim();
        const event = val(row.eventName);
        if (!event || !COUNTRIES.has(country) || NOISE.test(event)) continue;
        economicEvents.push({
          date,
          time: val(row.gmt),
          country,
          event,
          actual: val(row.actual),
          consensus: val(row.consensus),
          previous: val(row.previous),
        });
      }
    } catch (e) {
      log('econ', `${date} 실패: ${(e as Error).message}`);
    }
  }

  log('econ', `경제지표 ${economicEvents.length}건 수집`);
  return { market: { economicEvents } };
};

export default econCalendar;
