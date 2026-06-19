#!/bin/bash
# 클라우드 세션 시작 시 의존성 설치 (SessionStart 훅에서 호출).
# 로컬 세션에서는 건너뛴다 (CLAUDE_CODE_REMOTE 가 cloud 에서만 "true").
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR" || exit 0
# 이미 설치돼 있으면 빠르게 통과
if [ ! -d node_modules ]; then
  npm install || true
fi
exit 0
