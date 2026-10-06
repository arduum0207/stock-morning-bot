/**
 * 브리핑 HTML 의 기사 제목 링크(a.title)를 뽑아, 텔레그램 "탭하면 복사" 버튼 목록으로 만든다.
 *
 * 왜 HTML 안에 복사 버튼을 두지 않나: 텔레그램 앱의 첨부 HTML 미리보기는 JavaScript 를 실행하지 않는다.
 * JS 없이는 HTML 이 클립보드에 쓸 방법이 없어서, 문서 안 버튼으로는 "한 번 탭 = 복사" 가 불가능하다.
 * 대신 텔레그램 자체 기능인 인라인 키보드 copy_text 버튼(Bot API 7.11+)을 쓴다 — 탭하면 바로 복사된다.
 */

export interface TitleLink {
  /** 소속 섹션: "시장" 또는 종목명 (ticker-head 의 .name) */
  group: string;
  title: string;
  url: string;
}

const TITLE_LINK = /<a\b([^>]*\bclass\s*=\s*["'][^"']*\btitle\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const GROUP_NAME = /<span\b[^>]*\bclass\s*=\s*["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;

function decode(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 문서 순서대로 제목 링크를 뽑는다. 종목 헤더(.name) 이전 것은 "시장" 으로 묶는다. */
export function extractTitleLinks(html: string): TitleLink[] {
  const heads = [...html.matchAll(GROUP_NAME)].map((m) => ({ at: m.index ?? 0, name: decode(m[1]) }));
  const out: TitleLink[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(TITLE_LINK)) {
    const h = m[1].match(HREF);
    const url = decode(h?.[1] ?? h?.[2] ?? '');
    if (!/^https?:\/\//i.test(url)) continue;
    const at = m.index ?? 0;
    let group = '시장';
    for (const hd of heads) if (hd.at < at) group = hd.name;
    const title = decode(m[2]);
    const key = `${group}\n${url}`;
    if (seen.has(key)) continue; // 같은 섹션에 같은 기사가 두 번 있으면 한 번만
    seen.add(key);
    out.push({ group, title, url });
  }
  return out;
}

const LABEL_MAX = 40; // 폰 한 줄에 대략 들어가는 길이
const COPY_TEXT_MAX = 256; // 텔레그램 copy_text 제한

const cut = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);

export type InlineButton = { text: string; copy_text: { text: string } } | { text: string; url: string };

/**
 * 한 줄에 버튼 하나. 섹션(시장·종목)이 바뀔 때마다 "── 삼성전자 ──" 구분 줄을 넣고, 기사 버튼엔 제목만 쓴다.
 * 텔레그램 버튼은 동작이 꼭 있어야 해서 구분 줄도 copy_text(섹션명)로 둔다 — 눌러도 무해.
 * copy_text 제한(256자)을 넘는 URL 은 복사 대신 "열기" 버튼으로.
 */
export function copyButtons(links: TitleLink[]): InlineButton[][] {
  const rows: InlineButton[][] = [];
  let group = '';
  for (const l of links) {
    if (l.group !== group) {
      group = l.group;
      rows.push([{ text: `── ${cut(group, 20)} ──`, copy_text: { text: group } }]);
    }
    rows.push([
      l.url.length <= COPY_TEXT_MAX
        ? { text: cut(l.title, LABEL_MAX), copy_text: { text: l.url } }
        : { text: `↗ ${cut(l.title, LABEL_MAX - 2)}`, url: l.url },
    ]);
  }
  return rows;
}
