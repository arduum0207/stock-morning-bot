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

import { loadWatchlist, saveWatchlist, loadPending, savePending } from './config';
import type { PendingMode } from './config';
import { getUpdates, confirmUpdates, sendMessage, registerCommands } from './telegram';
import { resolveStock } from './resolve';
import type { WatchTicker, Watchlist } from './types';

const MY_CHAT = process.env.TELEGRAM_CHAT_ID;

const HELP_TEXT =
  '🤖 <b>종목 브리핑 봇</b>\n' +
  '/list — 현재 관심종목\n' +
  '/add &lt;종목명|티커&gt; — 추가 (예: /add 삼성전자)\n' +
  '/remove &lt;종목명|티커&gt; — 삭제\n' +
  '메뉴의 /add·/remove는 탭한 뒤 종목명을 한 번 더 보내면 돼요.\n' +
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

/** 관심종목 1건 추가. 결과 한 줄을 lines에 push. */
async function doAdd(wl: Watchlist, arg: string, lines: string[]): Promise<void> {
  const cands = await resolveStock(arg);
  if (cands.length === 0) {
    lines.push(`❓ "${arg}" 종목을 찾지 못함`);
    return;
  }
  const c = cands[0];
  if (wl.tickers.some((t) => t.ticker === c.ticker && t.market === c.market)) {
    lines.push(`· 이미 있음: ${c.name}(${c.ticker})`);
    return;
  }
  const item: WatchTicker = { ticker: c.ticker, name: c.name, market: c.market };
  wl.tickers.push(item);
  lines.push(`➕ 추가: ${c.name}(${c.ticker}/${c.market})`);
}

/** 관심종목 1건 삭제. 결과 한 줄을 lines에 push. */
async function doRemove(wl: Watchlist, arg: string, lines: string[]): Promise<void> {
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
    return;
  }
  const removed = wl.tickers.splice(idx, 1)[0];
  lines.push(`➖ 삭제: ${removed.name}(${removed.ticker})`);
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

  // 내 chat 에서 온 메시지만 채택 (순서 유지 — 대기상태가 메시지 순서를 따라감)
  const mine = MY_CHAT ? updates.filter((u) => u.chatId === MY_CHAT) : updates;

  const wl = await loadWatchlist();
  const before = JSON.stringify(wl.tickers);
  const lines: string[] = [];

  // 메뉴에서 인자 없이 /add 만 탭한 경우, 다음에 온 일반 메시지를 그 인자로 쓴다.
  // 이전 폴링에서 넘어온 대기상태로 시작 (배치가 끊겨도 이어지도록).
  let pending: PendingMode = await loadPending();
  let interactions = 0; // 실제로 처리한 명령/입력 수 (회신 여부 판단)

  for (const msg of mine) {
    const parsed = parseCmd(msg.text);

    // 슬래시 명령이 아닌 일반 텍스트 → 대기 중인 명령의 인자로 소비
    if (!parsed) {
      const arg = msg.text.trim();
      if (pending && arg) {
        interactions++;
        if (pending === 'add') await doAdd(wl, arg, lines);
        else await doRemove(wl, arg, lines);
        pending = null;
      }
      continue; // 대기 없으면 잡담은 무시
    }

    const { cmd, arg } = parsed;
    if (cmd === 'list') {
      interactions++; // 최종 목록은 아래에서 항상 출력
      pending = null;
      continue;
    }
    if (cmd === 'help') {
      interactions++;
      lines.push(HELP_TEXT);
      pending = null;
      continue;
    }

    // add / remove
    interactions++;
    if (arg) {
      // 인자가 같이 온 정상 케이스 (예: /add 삼성전자)
      if (cmd === 'add') await doAdd(wl, arg, lines);
      else await doRemove(wl, arg, lines);
      pending = null;
    } else {
      // 메뉴 탭으로 인자 없이 온 케이스 → 다음 메시지를 기다린다
      pending = cmd;
      lines.push(
        cmd === 'add'
          ? '➕ 추가할 종목명이나 티커를 메시지로 보내줘 (예: 삼성전자, NVDA)'
          : '➖ 삭제할 종목명이나 티커를 메시지로 보내줘'
      );
    }
  }

  const changed = JSON.stringify(wl.tickers) !== before;
  if (changed) await saveWatchlist(wl);

  // 대기상태 영속화 (다음 폴링에서 일반 메시지를 인자로 이어받기 위해)
  await savePending(pending);

  // 처리한 업데이트 확정 제거 (다음 폴링 재등장 방지)
  const maxId = Math.max(...updates.map((u) => u.updateId));
  if (Number.isFinite(maxId)) await confirmUpdates(maxId);

  // 회신 (명령/입력이 하나라도 있었을 때만)
  if (interactions > 0) {
    const listStr = wl.tickers.map((t) => `${t.name}(${t.ticker})`).join(', ') || '(없음)';
    const head = lines.length ? lines.join('\n') + '\n\n' : '';
    await sendMessage(`${head}📋 현재 관심종목 ${wl.tickers.length}개: ${listStr}`);
  }

  console.log(`· 입력 ${interactions}건 처리 (수신 ${updates.length}, 대기=${pending ?? '없음'})`);
  console.log(changed ? 'CHANGED' : 'NOCHANGE');
}

main().catch((e) => {
  console.error('❌ commands 예외:', (e as Error).message);
  process.exit(1);
});
