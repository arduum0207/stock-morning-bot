/**
 * 브리핑 HTML 을 GitHub Pages(gh-pages 브랜치)에 올리고 공개 URL 을 돌려준다.
 *
 * 왜: 텔레그램 앱의 첨부 HTML 미리보기는 JS 를 안 돌려서 "🔗 복사" 버튼이 동작하지 않는다.
 * 웹페이지로 올려 링크로 보내면 텔레그램 인앱 브라우저에서 열리고, 거기선 JS 가 돌아 탭 한 번에 복사된다.
 *
 * - 파일명에 랜덤 꼬리를 붙여 URL 을 추측할 수 없게 한다 (목록 페이지도 만들지 않음).
 * - 레포의 git 자격증명(예약 루틴 세션의 push 권한)을 그대로 쓴다. 별도 토큰 불필요.
 * - 주소를 바꾸고 싶으면 PAGES_BASE_URL 환경변수 (예: https://me.github.io/stock-morning-bot).
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const BRANCH = 'gh-pages';
const DIR = 'b';

const git = (args: string[], cwd?: string) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

/** origin URL 에서 owner/repo 를 뽑아 https://owner.github.io/repo 를 만든다 (프록시 URL 이어도 끝 두 경로로 판별). */
function pagesBase(): string {
  if (process.env.PAGES_BASE_URL) return process.env.PAGES_BASE_URL.replace(/\/+$/, '');
  const url = git(['remote', 'get-url', 'origin']).replace(/\.git$/, '');
  const m = url.match(/[/:]([^/:]+)\/([^/]+)$/);
  if (!m) throw new Error(`origin URL 에서 owner/repo 를 못 찾음: ${url}`);
  return `https://${m[1].toLowerCase()}.github.io/${m[2]}`;
}

export async function publishToPages(file: string): Promise<string> {
  const name = basename(file).replace(/\.html?$/i, '') + '-' + randomBytes(5).toString('hex') + '.html';
  const url = `${pagesBase()}/${DIR}/${name}`;

  const wt = mkdtempSync(join(tmpdir(), 'pages-'));
  rmSync(wt, { recursive: true, force: true }); // worktree add 는 빈 경로를 원함
  let hasBranch = true;
  try {
    git(['fetch', '-q', 'origin', BRANCH]);
  } catch {
    hasBranch = false; // 첫 업로드 — 브랜치를 새로 만든다
  }
  try {
    if (hasBranch) {
      git(['worktree', 'add', '-q', '--detach', wt, 'FETCH_HEAD']);
    } else {
      git(['worktree', 'add', '-q', '--detach', wt]);
      git(['checkout', '-q', '--orphan', `${BRANCH}-tmp-${Date.now()}`], wt);
      git(['rm', '-rq', '--cached', '.'], wt);
      git(['clean', '-fdxq'], wt);
      writeFileSync(join(wt, '.nojekyll'), '');
    }
    mkdirSync(join(wt, DIR), { recursive: true });
    copyFileSync(file, join(wt, DIR, name));
    git(['add', '-A'], wt);
    git(
      ['-c', 'user.name=stock-morning-bot', '-c', 'user.email=bot@users.noreply.github.com',
        'commit', '-qm', `brief: ${name}`],
      wt
    );
    git(['push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`], wt);
  } finally {
    try {
      git(['worktree', 'remove', '--force', wt]);
    } catch {
      if (existsSync(wt)) rmSync(wt, { recursive: true, force: true });
    }
  }

  await waitLive(url);
  return url;
}

/** Pages 빌드는 보통 30초~1분. 열리기 전에 링크를 보내면 404 를 보게 되니 최대 3분 기다린다. */
async function waitLive(url: string): Promise<void> {
  const until = Date.now() + 180_000;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) return;
    } catch {
      // 네트워크 정책상 github.io 를 못 볼 수도 있다 — 그냥 계속 기다리다 시간 되면 보낸다
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.warn(`⚠️ 3분 안에 페이지가 안 열림(빌드 지연일 수 있음) — 링크는 그대로 보냄: ${url}`);
}
