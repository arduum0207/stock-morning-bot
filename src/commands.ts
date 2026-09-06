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

/**
 * 인자 없이 /add·/remove 만 탭했을 때 되묻는 문구.
 * ForceReply 로 보내므로 유저 입력창이 자동으로 이 메시지의 답장 모드가 된다.
 * 답장으로 되돌아온 원문을 여기 문구와 대조해 "무슨 명령의 인자인지" 되찾는다
 * (→ .bot-state.json 이 없어도 동작. 클라우드는 매 실행 새 clone 이라 상태가 휘발한다).
 */
const ASK_TEXT: Record<'add' | 'remove', string> = {
  add: '➕ 추가할 종목명이나 티커를 이 메시지에 답장으로 보내줘 (예: 삼성전자, NVDA)',
  remove: '➖ 삭제할 종목명이나 티커를 이 메시지에 답장으로 보내줘',
};

/** 답장 대상 원문이 우리 질문이면 어느 명령이었는지 돌려준다. */
function replyMode(replyToText: string | null): PendingMode {
  if (!replyToText) return null;
  const t = replyToText.trim();
  if (t.startsWith(ASK_TEXT.add)) return 'add';
  if (t.startsWith(ASK_TEXT.remove)) return 'remove';
  return null;
}

const HELP_TEXT =
  '🤖 <b>종목 브리핑 봇</b>\n' +
  '/list — 현재 관심종목\n' +
  '/add &lt;종목명|티커&gt; — 추가 (예: /add 삼성전자)\n' +
  '/remove &lt;종목명|티커&gt; — 삭제\n' +
  '메뉴에서 /add·/remove를 탭하면 봇이 되물어요. 그 메시지에 종목명만 답장하면 돼요.\n' +
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
  let interactions = 0; // 실제로 처리한 명령/입력 수 (로그용)
  let listRequested = false; // /list 는 결과 줄이 없어도 목록을 회신해야 한다

  for (const msg of mine) {
    const parsed = parseCmd(msg.text);

    // 슬래시 명령이 아닌 일반 텍스트 → 대기 중인 명령의 인자로 소비.
    // 우리 질문에 대한 답장이면 그 질문이 어느 명령이었는지가 확실하다(대기상태보다 우선).
    if (!parsed) {
      const arg = msg.text.trim();
      const mode = replyMode(msg.replyToText) ?? pending;
      if (mode && arg) {
        interactions++;
        if (mode === 'add') await doAdd(wl, arg, lines);
        else await doRemove(wl, arg, lines);
        pending = null;
      }
      continue; // 대기 없으면 잡담은 무시
    }

    const { cmd, arg } = parsed;
    if (cmd === 'list') {
      interactions++; // 최종 목록은 아래에서 항상 출력
      listRequested = true;
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
      // 메뉴 탭으로 인자 없이 온 케이스 → 다음 메시지를 기다린다.
      // 되묻는 질문은 배치를 다 훑은 뒤(= 인자가 끝내 안 온 게 확정되면) ForceReply 로 보낸다.
      pending = cmd;
    }
  }

  const changed = JSON.stringify(wl.tickers) !== before;
  if (changed) await saveWatchlist(wl);

  // 대기상태 영속화 (다음 폴링에서 일반 메시지를 인자로 이어받기 위해)
  await savePending(pending);

  // 처리한 업데이트 확정 제거 (다음 폴링 재등장 방지)
  const maxId = Math.max(...updates.map((u) => u.updateId));
  if (Number.isFinite(maxId)) await confirmUpdates(maxId);

  // 회신 — 할 말(결과 줄)이 있거나 /list 를 받았을 때만.
  // 인자 없는 /add 만 온 경우엔 목록을 되풀이하지 않고 아래 ForceReply 질문만 보낸다.
  if (lines.length > 0 || listRequested) {
    const listStr = wl.tickers.map((t) => `${t.name}(${t.ticker})`).join(', ') || '(없음)';
    const head = lines.length ? lines.join('\n') + '\n\n' : '';
    await sendMessage(`${head}📋 현재 관심종목 ${wl.tickers.length}개: ${listStr}`);
  }

  // 인자를 못 받은 /add·/remove 가 남았으면 마지막에 되묻는다.
  // ForceReply 는 마지막 메시지여야 입력창이 답장 모드로 열린다 → 목록 회신 뒤에 보낸다.
  if (pending) {
    await sendMessage(ASK_TEXT[pending], {
      forceReply: true,
      placeholder: pending === 'add' ? '추가할 종목명 또는 티커' : '삭제할 종목명 또는 티커',
    });
  }

  console.log(`· 입력 ${interactions}건 처리 (수신 ${updates.length}, 대기=${pending ?? '없음'})`);
  console.log(changed ? 'CHANGED' : 'NOCHANGE');
}

main().catch((e) => {
  console.error('❌ commands 예외:', (e as Error).message);
  process.exit(1);
});
