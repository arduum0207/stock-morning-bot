/**
 * 텔레그램 명령 처리 (v2). 아침 루틴이 수집 전에 1회 실행한다.
 *   /add <종목명|티커>     관심종목 추가 (네이버 자동완성으로 이름→티커 해석)
 *   /remove <종목명|티커>  삭제 (별칭 /rm)
 *   /list                  현재 목록 조회
 *
 * 흐름: getUpdates 로 그동안 온 명령 수거 → watchlist.json 갱신 → 결과 회신 → 업데이트 확정제거.
 * 종목 리스트는 파일이므로, 변경 시 에이전트(ROUTINE.md)가 레포에 커밋해 영속화한다.
 * stdout 마지막 줄에 CHANGED / NOCHANGE 를 출력 → 에이전트가 커밋 여부 판단.
 */
import { config } from 'dotenv';
config();

import { loadWatchlist, saveWatchlist } from './config';
import { getUpdates, confirmUpdates, sendMessage, registerCommands } from './telegram';
import { resolveStock } from './resolve';
import type { WatchTicker } from './types';

const MY_CHAT = process.env.TELEGRAM_CHAT_ID;

const HELP_TEXT =
  '🤖 <b>종목 브리핑 봇</b>\n' +
  '/list — 현재 관심종목\n' +
  '/add &lt;종목명|티커&gt; — 추가 (예: /add 삼성전자)\n' +
  '/remove &lt;종목명|티커&gt; — 삭제\n' +
  '명령은 다음 아침 실행 때 반영돼요.';

interface ParsedCmd {
  cmd: 'add' | 'remove' | 'list' | 'help';
  arg: string;
}

function parseCmd(text: string): ParsedCmd | null {
  const m = text.trim().match(/^\/(add|remove|rm|list|help|start)\b\s*(.*)$/i);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const cmd =
    raw === 'rm' ? 'remove' : raw === 'start' ? 'help' : (raw as 'add' | 'remove' | 'list' | 'help');
  return { cmd, arg: m[2].trim() };
}

async function main() {
  // 명령 메뉴 등록 (입력창 "/" 자동완성). best-effort — 실패해도 진행.
  await registerCommands().catch(() => console.warn('· setMyCommands 실패(무시)'));

  const updates = await getUpdates();
  if (updates.length === 0) {
    console.log('· 새 명령 없음');
    console.log('NOCHANGE');
    return;
  }

  // 내 chat 에서 온 명령만 채택
  const mine = MY_CHAT ? updates.filter((u) => u.chatId === MY_CHAT) : updates;
  const cmds = mine.map((u) => parseCmd(u.text)).filter((x): x is ParsedCmd => x !== null);

  const wl = await loadWatchlist();
  const before = JSON.stringify(wl.tickers);
  const lines: string[] = [];

  for (const { cmd, arg } of cmds) {
    if (cmd === 'list') continue; // 최종 목록은 아래에서 항상 출력
    if (cmd === 'help') {
      lines.push(HELP_TEXT);
      continue;
    }

    if (cmd === 'add') {
      if (!arg) {
        lines.push('⚠️ /add 뒤에 종목명이나 티커를 적어줘');
        continue;
      }
      const cands = await resolveStock(arg);
      if (cands.length === 0) {
        lines.push(`❓ "${arg}" 종목을 찾지 못함`);
        continue;
      }
      const c = cands[0];
      if (wl.tickers.some((t) => t.ticker === c.ticker && t.market === c.market)) {
        lines.push(`· 이미 있음: ${c.name}(${c.ticker})`);
        continue;
      }
      const item: WatchTicker = { ticker: c.ticker, name: c.name, market: c.market };
      wl.tickers.push(item);
      lines.push(`➕ 추가: ${c.name}(${c.ticker}/${c.market})`);
    } else if (cmd === 'remove') {
      if (!arg) {
        lines.push('⚠️ /remove 뒤에 종목명이나 티커를 적어줘');
        continue;
      }
      const key = arg.toLowerCase();
      let idx = wl.tickers.findIndex(
        (t) => t.ticker.toLowerCase() === key || t.name.toLowerCase() === key
      );
      if (idx === -1) {
        // 이름 변형 등 → 자동완성으로 티커 해석 후 재시도
        const c = (await resolveStock(arg))[0];
        if (c) idx = wl.tickers.findIndex((t) => t.ticker === c.ticker && t.market === c.market);
      }
      if (idx === -1) {
        lines.push(`❓ 목록에서 "${arg}"를 찾지 못함`);
        continue;
      }
      const removed = wl.tickers.splice(idx, 1)[0];
      lines.push(`➖ 삭제: ${removed.name}(${removed.ticker})`);
    }
  }

  const changed = JSON.stringify(wl.tickers) !== before;
  if (changed) await saveWatchlist(wl);

  // 처리한 업데이트 확정 제거 (다음 폴링 재등장 방지)
  const maxId = Math.max(...updates.map((u) => u.updateId));
  if (Number.isFinite(maxId)) await confirmUpdates(maxId);

  // 회신 (명령이 하나라도 있었을 때만)
  if (cmds.length > 0) {
    const listStr = wl.tickers.map((t) => `${t.name}(${t.ticker})`).join(', ') || '(없음)';
    const head = lines.length ? lines.join('\n') + '\n\n' : '';
    await sendMessage(`${head}📋 현재 관심종목 ${wl.tickers.length}개: ${listStr}`);
  }

  console.log(`· 명령 ${cmds.length}건 처리 (수신 ${updates.length})`);
  console.log(changed ? 'CHANGED' : 'NOCHANGE');
}

main().catch((e) => {
  console.error('❌ commands 예외:', (e as Error).message);
  process.exit(1);
});
