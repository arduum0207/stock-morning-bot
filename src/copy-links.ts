/**
 * 브리핑 HTML 의 기사 제목(a.title) 옆에 "🔗 복사" 버튼을 박아 넣는다. send 직전에 호출.
 *
 * 버튼은 정적 HTML 로 넣고(에이전트가 빠뜨릴 수 없게), 복사는 인라인 스크립트가 한다.
 * 주의: 텔레그램 앱의 "첨부 HTML 미리보기"는 JS 를 안 돌린다(실측). 그래서 브리핑은 웹페이지로 올려
 * 텔레그램 인앱 브라우저로 열게 한다(publish.ts) — 거기선 탭 한 번에 복사된다.
 * 여러 번 돌려도 한 번만 들어간다.
 */

const MARK = 'data-copylinks';

const CSS = `<style ${MARK}>
  button.copy { display:inline-flex; align-items:center; vertical-align:2px; margin-left:6px;
    padding:1px 7px; font-size:11px; line-height:1.5; font-weight:400; color:#6b7280; background:#f0f2f5;
    border:1px solid #e5e7eb; border-radius:999px; cursor:pointer; font-family:inherit;
    -webkit-tap-highlight-color:transparent; }
  button.copy.done { color:#15803d; background:#e7f6ec; border-color:#bfe5cb; }
</style>`;

// clipboard API → execCommand 폴백 → 그래도 안 되면 prompt 로 URL 을 띄운다.
const SCRIPT = `<script ${MARK}>
(function () {
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return fallback(text); });
    }
    return Promise.resolve(fallback(text));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button.copy[data-url]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var url = b.getAttribute('data-url');
    copy(url).then(function (ok) {
      if (!ok) { window.prompt('링크를 복사하세요', url); return; }
      b.textContent = '✓ 복사됨'; b.classList.add('done');
      setTimeout(function () { b.textContent = '🔗 복사'; b.classList.remove('done'); }, 1500);
    });
  });
})();
</script>`;

/** 예전 방식(JS 로 button.copy 를 만들어 붙이던 스크립트)이 남아 있으면 버튼이 두 개가 되므로 걷어낸다.
 *  본문에 '<script' 가 또 나오면 안 되게 해서, 주석 속 "<script>" 글자부터 진짜 </script> 까지 먹는 일을 막는다. */
const LEGACY_SCRIPT = /<script>(?:(?!<\/?script)[\s\S])*?querySelectorAll\(\s*['"]a\.title(?:(?!<\/?script)[\s\S])*<\/script>/g;

/** class 에 title 이 들어간 <a href=...>...</a> */
const TITLE_LINK = /<a\b[^>]*\bclass\s*=\s*["'][^"']*\btitle\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

export function addCopyLinks(html: string): string {
  if (html.includes(MARK)) return html; // 이미 처리됨
  let out = html.replace(LEGACY_SCRIPT, '');
  let n = 0;
  out = out.replace(TITLE_LINK, (a) => {
    const m = a.match(HREF);
    const raw = m?.[1] ?? m?.[2] ?? '';
    if (!/^https?:\/\//i.test(raw)) return a;
    n++;
    // raw 는 원본 속성값(이미 이스케이프됨). 큰따옴표만 막아 data-url 속성에 그대로 넣는다.
    return `${a}<button type="button" class="copy" data-url="${raw.replace(/"/g, '&quot;')}">🔗 복사</button>`;
  });
  if (n === 0) return html;
  out = out.includes('</head>') ? out.replace('</head>', `${CSS}\n</head>`) : CSS + out;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${SCRIPT}\n</body>`) : out + SCRIPT;
  return out;
}
