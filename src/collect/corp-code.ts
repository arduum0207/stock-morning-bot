/**
 * DART 고유번호(corp_code) 자동 해석 — cik.ts(US)의 KR 판.
 * https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=KEY
 *   → CORPCODE.xml 한 개가 든 ZIP (전체 기업 매핑, 단일 호출)
 *
 * watchlist 의 KR 종목 중 dartCorpCode 가 비어있는 항목을 종목코드로 찾아 채운다(in-place).
 * 텔레그램 `/add 삼성전자` 로 넣은 종목은 종목코드(005930)만 들어오는데,
 * DART 공시 조회는 종목코드가 아니라 고유번호(00126380)를 요구한다 — 그 간극을 여기서 메운다.
 */
import { inflateRawSync } from 'node:zlib';
import type { WatchTicker } from '../types';
import { fetchBuffer, log } from './common';

const SIG_EOCD = 0x06054b50; // End of Central Directory
const SIG_CEN = 0x02014b50; // 중앙 디렉터리 엔트리
const SIG_LOC = 0x04034b50; // 로컬 파일 헤더

/**
 * ZIP 에서 첫 번째 .xml 엔트리를 꺼낸다.
 * 런타임 의존성을 dotenv 하나로 유지하려고 최소 구현했다 — DART 가 주는
 * "단일 파일 · deflate · zip64 아님" 형태만 다루고, 벗어나면 throw 한다.
 */
function unzipFirstXml(buf: Buffer): Buffer {
  // EOCD 는 파일 끝에 있다. 주석이 붙어도 최대 64KB 안이라 뒤에서부터 훑는다.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP 형식이 아님 (EOCD 없음)');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // 중앙 디렉터리 시작 오프셋

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== SIG_CEN) throw new Error('ZIP 중앙 디렉터리 손상');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    if (name.toLowerCase().endsWith('.xml')) {
      if (compSize === 0xffffffff || localOff === 0xffffffff) {
        throw new Error('zip64 는 지원하지 않음');
      }
      if (method !== 0 && method !== 8) throw new Error(`지원하지 않는 압축 방식(${method})`);
      if (buf.readUInt32LE(localOff) !== SIG_LOC) throw new Error('ZIP 로컬 헤더 손상');
      // 로컬 헤더의 이름·extra 길이는 중앙 디렉터리와 다를 수 있다 → 로컬에서 다시 읽는다.
      const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
      const data = buf.subarray(start, start + compSize);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  throw new Error('ZIP 안에 .xml 이 없음');
}

/** CORPCODE.xml → { 종목코드 → 고유번호 }. 비상장(stock_code 공백)은 버린다. */
function parseCorpMap(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const listRe = /<list>([\s\S]*?)<\/list>/g;
  let m: RegExpExecArray | null;
  while ((m = listRe.exec(xml)) !== null) {
    const body = m[1];
    const corp = /<corp_code>([^<]*)<\/corp_code>/.exec(body)?.[1]?.trim();
    const stock = /<stock_code>([^<]*)<\/stock_code>/.exec(body)?.[1]?.trim();
    if (corp && stock) map.set(stock, corp);
  }
  return map;
}

export async function resolveCorpCode(tickers: WatchTicker[]): Promise<void> {
  const need = tickers.filter((t) => t.market === 'KR' && !t.dartCorpCode);
  if (need.length === 0) return;

  const key = process.env.DART_API_KEY;
  if (!key) {
    log('corpCode', 'DART_API_KEY 없음 — skip (KR 공시는 어차피 수집 안 됨)');
    return;
  }

  try {
    const buf = await fetchBuffer(
      `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`,
      { timeoutMs: 30_000 } // 압축 1MB 남짓 — 기본 15초로는 빠듯할 수 있다
    );
    // 키가 틀리면 ZIP 대신 <result><status>020</status>... XML 이 온다.
    if (buf.length < 4 || buf.readUInt16BE(0) !== 0x504b) {
      const status = /<status>([^<]*)<\/status>/.exec(buf.toString('utf8').slice(0, 500))?.[1];
      throw new Error(`ZIP 이 아닌 응답 (DART status=${status ?? '?'})`);
    }

    const map = parseCorpMap(unzipFirstXml(buf).toString('utf8'));
    for (const t of need) {
      const corp = map.get(t.ticker);
      if (corp) t.dartCorpCode = corp;
    }
    const ok = need.filter((t) => t.dartCorpCode).length;
    log('corpCode', `KR 고유번호 자동 해석 ${ok}/${need.length} (전체 매핑 ${map.size}종목)`);
    for (const t of need.filter((x) => !x.dartCorpCode)) {
      log('corpCode', `${t.name}(${t.ticker}) 매칭 실패 — 상장 종목이 맞는지 확인 필요`);
    }
  } catch (e) {
    log('corpCode', `해석 실패(KR 공시 일부 누락 가능): ${(e as Error).message}`);
  }
}
