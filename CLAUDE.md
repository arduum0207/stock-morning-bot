# stock-morning-bot

보유·관심 종목의 **뉴스·공시·실적**을 매일 아침 **텔레그램으로** 보내주는 봇.
Claude Code 의 **예약 루틴(클라우드)** 으로 돌아가며, 비용은 각자 **구독 사용량**에서 차감된다(종량 API 아님).

## 동작 한눈에
1. `npm run collect` → 수집기들이 watchlist.json 종목의 데이터를 모아 `out/collected.json` 저장 (LLM 미사용)
2. **예약 에이전트(=너, 구독)** 가 `out/collected.json` 을 읽어 종목별로 요약·정렬하고 자체완결형 HTML 생성
3. `npm run send out/brief-<날짜>.html "<캡션>"` → 텔레그램 문서 첨부 전송

매일 따를 구체 절차는 **ROUTINE.md** 에 있다.

## Commands
- `npm run commands` — 텔레그램 `/add`·`/remove`·`/list` 수거 → watchlist.json 갱신 (마지막 줄 CHANGED/NOCHANGE)
- `npm run collect` — 데이터 수집 → `out/collected.json`
- `npm run send <html> [caption]` — HTML을 텔레그램으로 전송
- `npm run typecheck` — 타입 체크

## 안전 규칙 (중요)
- **요약·HTML 생성은 에이전트(구독)가 직접 한다.** `ANTHROPIC_API_KEY` 등으로 외부 LLM API를 호출하지 말 것 — 그건 종량 과금이다. 예약 루틴 자체가 구독으로 도는 게 이 프로젝트의 핵심.
- 시크릿(토큰·API 키)은 **Cloud Environment 환경변수**로만 주입. 레포에 키를 커밋하지 않는다.
- 수집기는 외부 API가 없으면(해당 env 미설정) 조용히 skip 한다 — 일부 소스만 있어도 동작한다.

## 구조
```
src/
  types.ts            공통 타입
  config.ts           watchlist.json 로드·검증
  collect/
    common.ts         fetch 유틸
    dart.ts           KR 공시 (DART)
    naver-news.ts     KR 뉴스 (네이버)
    sec.ts            US 공시 (SEC EDGAR)
    fmp.ts            US 실적 (FMP)
    rss.ts            US 뉴스 (Yahoo RSS)
    cik.ts            US ticker→CIK 자동 해석
    run.ts            오케스트레이터 → out/collected.json
  telegram.ts         sendDocument / sendMessage
  send.ts             CLI 발송
templates/sample-brief.html   생성할 HTML 스타일 레퍼런스
watchlist.json        종목 리스트 (각자 자기 포크에서 편집)
ROUTINE.md            예약 에이전트의 매일 절차
README.md             셋업 가이드(친구 배포용)
```

## Stack
TypeScript + tsx (Node 20+, 내장 fetch/FormData). 런타임 의존성은 dotenv 뿐.
