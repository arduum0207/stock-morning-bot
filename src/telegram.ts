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
