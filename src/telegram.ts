/**
 * 텔레그램 발송 래퍼 (Node 20+ 내장 fetch/FormData/Blob 사용, 외부 의존성 없음).
 *
 * 인증: TELEGRAM_BOT_TOKEN (BotFather), 수신: TELEGRAM_CHAT_ID.
 * 둘 다 Cloud Environment 의 환경변수로 주입한다 (레포에 커밋 금지).
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

interface TelegramResp {
  ok: boolean;
  description?: string;
}

function creds(): { token: string; chatId: string } {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN 환경변수 없음');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID 환경변수 없음');
  return { token, chatId };
}

/** HTML 파일을 문서 첨부로 전송. 유저는 채팅에서 첨부파일을 탭해 페이지를 본다. */
export async function sendDocument(filePath: string, caption?: string): Promise<void> {
  const { token, chatId } = creds();
  const buf = await readFile(filePath);

  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) {
    form.append('caption', caption.slice(0, 1024)); // 텔레그램 caption 길이 제한
    form.append('parse_mode', 'HTML');
  }
  form.append('document', new Blob([buf], { type: 'text/html' }), basename(filePath));

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as TelegramResp;
  if (!res.ok || !data.ok) {
    throw new Error(`텔레그램 sendDocument 실패: HTTP ${res.status} ${data.description ?? ''}`);
  }
}

/** 짧은 HTML 텍스트 메시지 전송 (특이사항 없음 알림 등). */
export async function sendMessage(html: string): Promise<void> {
  const { token, chatId } = creds();
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as TelegramResp;
  if (!res.ok || !data.ok) {
    throw new Error(`텔레그램 sendMessage 실패: HTTP ${res.status} ${data.description ?? ''}`);
  }
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
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=0`);
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
  await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${uptoUpdateId + 1}&timeout=0`);
}
