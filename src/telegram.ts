/**
 * 텔레그램 발송/수신 래퍼 (Node 20+ 내장 fetch/FormData/Blob, 외부 의존성 없음).
 *
 * 인증: TELEGRAM_BOT_TOKEN (BotFather), 수신: TELEGRAM_CHAT_ID.
 * 로컬 모드는 `.env`, 클라우드 모드는 Cloud Environment 환경변수로 주입 (레포 커밋 금지).
 *
 * 네트워크 재시도: 텔레그램 호출은 간헐적으로 "fetch failed"(일시 네트워크 오류)가 난다.
 * fetch가 throw한 경우(서버 도달 전)만 재시도하고, HTTP 응답을 받은 뒤의 오류는 재시도하지 않는다
 * (중복 전송·영구 오류 무한재시도 방지).
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

interface TelegramResp {
  ok: boolean;
  description?: string;
}

const RETRIES = 3;

function creds(): { token: string; chatId: string } {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN 환경변수 없음');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID 환경변수 없음');
  return { token, chatId };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch를 네트워크 오류에 한해 재시도. body를 매 시도마다 새로 만들어야 하므로
 * RequestInit가 아니라 "init을 만드는 함수"를 받는다 (FormData 재사용 불가 회피).
 */
async function fetchRetry(url: string, makeInit: () => RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < RETRIES; i++) {
    try {
      return await fetch(url, makeInit());
    } catch (e) {
      lastErr = e; // fetch throw = 네트워크 단계 실패 → 재시도 안전(서버 미도달)
      if (i < RETRIES - 1) await sleep(700 * (i + 1));
    }
  }
  throw new Error(`텔레그램 네트워크 오류(${RETRIES}회 시도): ${(lastErr as Error)?.message ?? lastErr}`);
}

async function ensureOk(res: Response, op: string): Promise<void> {
  const data = (await res.json().catch(() => ({}))) as TelegramResp;
  if (!res.ok || !data.ok) {
    throw new Error(`텔레그램 ${op} 실패: HTTP ${res.status} ${data.description ?? ''}`);
  }
}

/** HTML 파일을 문서 첨부로 전송. 유저는 채팅에서 첨부파일을 탭해 페이지를 본다. */
export async function sendDocument(filePath: string, caption?: string): Promise<void> {
  const { token, chatId } = creds();
  const buf = await readFile(filePath);
  const name = basename(filePath);

  const res = await fetchRetry(`https://api.telegram.org/bot${token}/sendDocument`, () => {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) {
      form.append('caption', caption.slice(0, 1024)); // 텔레그램 caption 길이 제한
      form.append('parse_mode', 'HTML');
    }
    form.append('document', new Blob([buf], { type: 'text/html' }), name);
    return { method: 'POST', body: form };
  });
  await ensureOk(res, 'sendDocument');
}

/** 짧은 HTML 텍스트 메시지 전송 (특이사항 없음 알림 등). */
export async function sendMessage(html: string): Promise<void> {
  const { token, chatId } = creds();
  const res = await fetchRetry(`https://api.telegram.org/bot${token}/sendMessage`, () => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  }));
  await ensureOk(res, 'sendMessage');
}

// ── 수신(명령 처리)용 ──────────────────────────────────────────────

interface TgChat {
  id?: number;
}
interface TgMsg {
  text?: string;
  chat?: TgChat;
}
interface TgUpdate {
  update_id: number;
  message?: TgMsg;
  channel_post?: TgMsg;
}

export interface IncomingMessage {
  updateId: number;
  chatId: string;
  text: string;
}

/**
 * 대기 중인 메시지 수거 (롱폴 없이 즉시).
 * 웹훅 미사용 가정. 미확정 업데이트는 텔레그램이 ~24시간 보관하므로 1일 1회 폴링과 맞는다.
 */
export async function getUpdates(): Promise<IncomingMessage[]> {
  const { token } = creds();
  const res = await fetchRetry(
    `https://api.telegram.org/bot${token}/getUpdates?timeout=0`,
    () => ({})
  );
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: TgUpdate[] };
  if (!data.ok || !data.result) return [];

  const out: IncomingMessage[] = [];
  for (const u of data.result) {
    const msg = u.message ?? u.channel_post;
    const text = msg?.text;
    if (typeof u.update_id !== 'number' || !text) continue;
    out.push({ updateId: u.update_id, chatId: msg?.chat?.id != null ? String(msg.chat.id) : '', text });
  }
  return out;
}

/** 처리 완료한 업데이트를 서버에서 확정 제거(offset). 다음 폴링에 재등장 방지. */
export async function confirmUpdates(uptoUpdateId: number): Promise<void> {
  const { token } = creds();
  await fetchRetry(
    `https://api.telegram.org/bot${token}/getUpdates?offset=${uptoUpdateId + 1}&timeout=0`,
    () => ({})
  );
}

/**
 * 봇 명령 메뉴 등록 (입력창에 "/" 만 쳐도 목록이 뜨게). 멱등 — 매번 호출해도 무해.
 * best-effort: 실패해도 봇 동작엔 지장 없음(호출부에서 catch).
 */
export async function registerCommands(): Promise<void> {
  const { token } = creds();
  const commands = [
    { command: 'list', description: '현재 관심종목 목록' },
    { command: 'add', description: '종목 추가 (예: /add 삼성전자)' },
    { command: 'remove', description: '종목 삭제 (예: /remove NVDA)' },
    { command: 'help', description: '사용법 보기' },
  ];
  const res = await fetchRetry(`https://api.telegram.org/bot${token}/setMyCommands`, () => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  }));
  await ensureOk(res, 'setMyCommands');
}
