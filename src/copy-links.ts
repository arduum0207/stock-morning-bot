/**
 * 브리핑 HTML 의 기사 제목(a.title) 옆에 "링크 복사" 버튼을 박아 넣는다. send 직전에 호출.
 *
 * 왜 JS 로 붙이지 않나: 텔레그램 앱의 첨부 HTML 미리보기는 JavaScript 를 실행하지 않는다.
 * 예전엔 스크립트가 버튼을 만들어 붙였는데, 그래서 폰에서는 버튼이 아예 안 보였다.
 *
 * 그래서 버튼을 정적 HTML(<details>)로 넣는다.
 *  - JS 꺼진 뷰어(텔레그램): 버튼을 탭하면 URL 칸이 펼쳐진다 → 길게 눌러 전체 선택 → 복사.
 *  - JS 되는 브라우저: 탭 한 번에 클립보드로 바로 복사(실패하면 위처럼 펼쳐짐).
 *
 * 에이전트가 HTML 을 어떻게 쓰든 같은 결과가 나오도록 여기서 기계적으로 처리한다. 여러 번 돌려도 한 번만 들어간다.
 */

const MARK = 'data-copylinks';

const CSS = `<style ${MARK}>
  details.cl { display:inline; margin-left:6px; }
  details.cl > summary { display:inline-flex; align-items:center; vertical-align:2px; list-style:none;
    padding:1px 7px; font-size:11px; line-height:1.5; font-weight:400; color:#6b7280; background:#f0f2f5;
    border:1px solid #e5e7eb; border-radius:999px; cursor:pointer; user-select:none; -webkit-user-select:none; }
  details.cl > summary::-webkit-details-marker { display:none; }
  details.cl.done > summary { color:#15803d; background:#e7f6ec; border-color:#bfe5cb; }
  details.cl .cl-box { display:block; margin-top:6px; }
  details.cl .cl-url { display:block; width:100%; box-sizing:border-box; resize:none; margin:0;
    padding:6px 8px; font:12px/1.4 ui-monospace,Menlo,monospace; color:#374151; background:#fff;
    border:1px solid #e5e7eb; border-radius:8px; word-break:break-all;
    user-select:all; -webkit-user-select:all; }
  details.cl .cl-hint { display:block; margin-top:3px; font-size:11px; color:#6b7280; }
</style>`;

// JS 가 되는 환경에서만: 펼치는 대신 바로 클립보드에 복사. 실패하면 기본 동작(펼치기)으로 둔다.
const SCRIPT = `<script ${MARK}>
(function () {
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
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
    var s = e.target.closest && e.target.closest('details.cl > summary');
    if (!s) return;
    var d = s.parentNode;
    if (d.open) return; // 이미 펼쳐져 있으면 접기는 기본 동작대로
    e.preventDefault();
    copy(d.querySelector('.cl-url').value).then(function (ok) {
      if (!ok) { d.open = true; return; }
      s.textContent = '✓ 복사됨'; d.classList.add('done');
      setTimeout(function () { s.textContent = '🔗 복사'; d.classList.remove('done'); }, 1500);
    });
  });
})();
</script>`;

/** 예전 방식(JS 로 button.copy 를 붙이던 스크립트)이 남아 있으면 버튼이 두 개가 되므로 걷어낸다. */
// 본문에 '<script' 가 또 나오면 안 되게 해서, 주석 속 "<script>" 글자부터 진짜 </script> 까지 통째로 먹는 일을 막는다.
const LEGACY_SCRIPT = /<script>(?:(?!<\/?script)[\s\S])*?querySelectorAll\(\s*['"]a\.title(?:(?!<\/?script)[\s\S])*<\/script>/g;

/** class 에 title 이 들어간 <a href=...>...</a> */
const TITLE_LINK = /<a\b[^>]*\bclass\s*=\s*["'][^"']*\btitle\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
const HREF = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/i;

function button(href: string): string {
  // href 는 원본 HTML 의 속성값(이미 이스케이프됨)이라 그대로 textarea 본문에 넣어도 안전하다.
  return (
    `<details class="cl"><summary>🔗 복사</summary>` +
    `<span class="cl-box"><textarea class="cl-url" rows="2" readonly>${href}</textarea>` +
    `<span class="cl-hint">길게 눌러 전체 선택 → 복사</span></span></details>`
  );
}

export function addCopyLinks(html: string): string {
  if (html.includes(MARK)) return html; // 이미 처리됨
  let out = html.replace(LEGACY_SCRIPT, '');
  let n = 0;
  out = out.replace(TITLE_LINK, (a) => {
    const m = a.match(HREF);
    const href = m ? (m[2] ?? m[3] ?? '') : '';
    if (!href || href.startsWith('#')) return a;
    n++;
    return a + button(href);
  });
  if (n === 0) return html;
  out = out.includes('</head>') ? out.replace('</head>', `${CSS}\n</head>`) : CSS + out;
  out = out.includes('</body>') ? out.replace(/<\/body>(?![\s\S]*<\/body>)/, `${SCRIPT}\n</body>`) : out + SCRIPT;
  return out;
}
