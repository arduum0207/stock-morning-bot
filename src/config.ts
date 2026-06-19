import { readFile, writeFile } from 'node:fs/promises';
import type { Watchlist } from './types';

function watchlistPath(): string {
  return process.env.WATCHLIST_PATH || 'watchlist.json';
}

/**
 * watchlist.json 로드 + 최소 검증.
 * 경로는 WATCHLIST_PATH 환경변수로 덮어쓸 수 있다 (기본: 레포 루트의 watchlist.json).
 */
export async function loadWatchlist(): Promise<Watchlist> {
  const p = watchlistPath();
  let raw: string;
  try {
    raw = await readFile(p, 'utf8');
  } catch {
    throw new Error(
      `watchlist 파일을 찾을 수 없습니다: ${p}\n` +
        `→ watchlist.example.json 을 watchlist.json 으로 복사한 뒤 종목을 채우세요.`
    );
  }

  let data: Watchlist;
  try {
    data = JSON.parse(raw) as Watchlist;
  } catch (e) {
    throw new Error(`watchlist.json JSON 파싱 실패: ${(e as Error).message}`);
  }

  if (!data || !Array.isArray(data.tickers)) {
    throw new Error('watchlist.json 형식 오류: { "tickers": [ ... ] } 구조여야 합니다.');
  }
  for (const t of data.tickers) {
    if (!t.ticker || !t.name || (t.market !== 'KR' && t.market !== 'US')) {
      throw new Error(
        `watchlist 항목 오류: ${JSON.stringify(t)}\n` +
          `→ ticker, name 은 필수이고 market 은 "KR" 또는 "US" 여야 합니다.`
      );
    }
  }
  return data;
}

/** watchlist.json 저장 (텔레그램 명령으로 종목 추가/삭제 후). */
export async function saveWatchlist(wl: Watchlist): Promise<void> {
  await writeFile(watchlistPath(), JSON.stringify(wl, null, 2) + '\n', 'utf8');
}
