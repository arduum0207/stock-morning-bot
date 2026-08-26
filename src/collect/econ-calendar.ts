/**
 * 경제지표 캘린더 — Nasdaq. 키 불필요(브라우저 UA 필요).
 *   GET /api/calendar/economicevents?date=YYYY-MM-DD
 *     → 지표 목록. actual/consensus/previous 가 함께 온다.
 *
 * ⚠️ 이 API 의 시간 표기 두 가지가 이름과 다르다. 실측으로 확인한 내용:
 *   1) 응답의 `gmt` 필드는 GMT 가 아니라 **미 동부시간(ET)** 이다.
 *      주간 신규실업수당 08:30(ET 고정), EIA 원유재고 10:30(ET 고정),
 *      일본 BoJ Core CPI 01:00(=14:00 JST), 한국 금통위 21:00(=다음날 10:00 KST)
 *      — 전부 ET 로 읽어야 실제 발표 시각과 맞는다.
 *   2) `date` 파라미터는 **이벤트 날짜 + 1** 이다. date=토요일 로 요청하면 금요일
 *      지표(시카고 PMI·미시간 소비자심리)가 23건 나오고, date=일요일 은 토요일
 *      이벤트만 1건 나온다. 그래서 D일 지표를 받으려면 D+1 로 요청해야 한다.
 * 두 보정을 거친 뒤 한국 사용자 기준으로 **KST 로 변환해서** 저장한다.
 *
 * 어제(=간밤 미국장 결과) ~ 앞으로 3영업일만 본다. 전 세계를 다 담으면 노이즈라
 * COUNTRIES 의 주요국만 남기고, 국채 입찰·주간 집계처럼 시장 브리핑에 쓸모없는
 * 항목(NOISE)은 버린다.
 *
 * 이 소스는 CPI 든 주간 잡지표든 전부 같은 무게로 준다(중요도 필드가 없다).
 * 그래서 이벤트 이름·국가로 importance 를 직접 매겨 정렬해 둔다 — 에이전트가
 * 위에서부터 몇 개만 집어도 FOMC·CPI 같은 큰 건이 먼저 잡히게.
 */
import type { CollectResult, Collector, EconomicEvent, Importance } from '../types';
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

/** 어제부터 앞으로 며칠(영업일)까지 볼지. ET 기준 이벤트 날짜. */
const FROM_DAYS = -1;
const TO_DAYS = 3;

const ET = 'America/New_York';
const KST_OFFSET_MIN = 9 * 60;

/** 정렬 후 남길 최대 건수. high/medium 이 먼저 오므로 잘려나가는 건 잡지표다. */
const MAX_EVENTS = 40;

/** 그 자체로 지수·금리를 움직이는 것들. */
const HIGH =
  /FOMC|Interest Rate Decision|Rate Statement|Fed Chair|CPI|PCE Price|PPI|Nonfarm|Non-Farm|Payrolls|Unemployment Rate|GDP|ISM |Retail Sales|Tankan/i;

/**
 * 연준 위원 발언은 "FOMC Member ... Speaks" 라 HIGH 의 /FOMC/ 에 걸린다.
 * 의장 발언이 아닌 이상 CPI·고용지표와 같은 무게는 아니라 따로 처리한다.
 */
const SPEECH = /Speaks|Speech/i;
const CHAIR = /Fed Chair|Powell/i;

/** 방향을 확인시켜 주는 2군. 연준 위원 발언·주간 실업수당 등. */
const MEDIUM =
  /Jobless Claims|PMI|Consumer Confidence|Consumer Sentiment|Durable Goods|Industrial Production|Trade Balance|Housing Starts|Building Permits|Home Sales|Factory Orders|Speaks|Minutes|Export|Import|Crude Oil Inventories|Employment Change/i;

/**
 * 우리 브리핑의 무게중심은 미국·한국이다. 그 밖의 나라 지표는 한 단계 낮춰
 * (예: 독일 GDP → medium) 미국 CPI 같은 게 아래로 밀리지 않게 한다.
 */
const CORE_COUNTRIES = new Set(['United States', 'South Korea']);

const RANK: Record<Importance, number> = { high: 0, medium: 1, low: 2 };

function demote(level: Importance): Importance {
  return level === 'high' ? 'medium' : 'low';
}

function baseImportance(event: string): Importance {
  if (SPEECH.test(event)) return CHAIR.test(event) ? 'high' : 'medium';
  if (/GDPNow/i.test(event)) return 'medium'; // 공식 발표가 아니라 실시간 추정치
  if (HIGH.test(event)) return 'high';
  if (MEDIUM.test(event)) return 'medium';
  return 'low';
}

function importanceOf(event: string, country: string): Importance {
  const base = baseImportance(event);
  return CORE_COUNTRIES.has(country) ? base : demote(base);
}

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

/** 주어진 시점에서 그 타임존의 UTC 오프셋(분). 서머타임(EDT/EST)이 자동 반영된다. */
function tzOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );
  return (asIfUtc - at.getTime()) / 60_000;
}

/** ET 기준 오늘 날짜(YYYY-MM-DD). 컨테이너가 UTC 라도 미국 날짜로 맞춘다. */
function todayInEt(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date());
}

/** "2026-08-27" + n일 */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

/**
 * ET 기준 날짜·시각 → KST 날짜·시각.
 * 시각이 없는(하루 종일) 이벤트는 변환하지 않고 ET 날짜를 그대로 둔다.
 */
function etToKst(date: string, time: string | null): { date: string; time: string | null } {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return { date, time: null };
  const [h, m] = time.split(':').map(Number);
  const naive = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    h,
    m
  );
  // ET 벽시계 시각을 실제 UTC 시각으로 되돌린 뒤, KST 로 옮긴다.
  const offset = tzOffsetMinutes(ET, new Date(naive));
  const kst = new Date(naive - offset * 60_000 + KST_OFFSET_MIN * 60_000);
  return {
    date: kst.toISOString().slice(0, 10),
    time: kst.toISOString().slice(11, 16),
  };
}

/** "&nbsp;" · 공백만 있는 값 → null */
function val(v: string | undefined): string | null {
  const s = (v ?? '').replace(/&nbsp;/g, ' ').trim();
  return s === '' ? null : s;
}

/** ET 기준 오늘로부터 from~to 일 사이의 영업일(주말 제외) 날짜 목록 */
function weekdayRange(from: number, to: number): string[] {
  const today = todayInEt();
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    const date = addDays(today, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(date);
  }
  return out;
}

const econCalendar: Collector = async (): Promise<CollectResult> => {
  const economicEvents: EconomicEvent[] = [];

  for (const eventDate of weekdayRange(FROM_DAYS, TO_DAYS)) {
    try {
      // date 파라미터는 이벤트 날짜 + 1 (파일 상단 주석 참고)
      const data = await fetchJson<EventsResp>(
        `https://api.nasdaq.com/api/calendar/economicevents?date=${addDays(eventDate, 1)}`,
        { headers: UA }
      );
      for (const row of data.data?.rows ?? []) {
        const country = (row.country ?? '').trim();
        const event = val(row.eventName);
        if (!event || !COUNTRIES.has(country) || NOISE.test(event)) continue;
        const kst = etToKst(eventDate, val(row.gmt));
        economicEvents.push({
          date: kst.date,
          time: kst.time,
          country,
          event,
          importance: importanceOf(event, country),
          actual: val(row.actual),
          consensus: val(row.consensus),
          previous: val(row.previous),
        });
      }
    } catch (e) {
      log('econ', `${eventDate} 실패: ${(e as Error).message}`);
    }
  }

  // 중요도 → 날짜 → 시각 순. 에이전트가 위에서부터 3~6개만 집어도 되게.
  economicEvents.sort(
    (a, b) =>
      RANK[a.importance] - RANK[b.importance] ||
      a.date.localeCompare(b.date) ||
      (a.time ?? '').localeCompare(b.time ?? '')
  );
  const top = economicEvents.slice(0, MAX_EVENTS);
  const high = top.filter((e) => e.importance === 'high').length;

  log('econ', `경제지표 ${top.length}건 수집 (주요 ${high}건 / 전체 후보 ${economicEvents.length})`);
  return { market: { economicEvents: top } };
};

export default econCalendar;
