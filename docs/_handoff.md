# 대화 핸드오프 — HWPX MCP 서버 모드 배포

다른 세션(특히 Obsidian 볼트가 붙은 데스크탑 앱) 에서 이어서 작업하기 위한 상태 기록입니다.

- **리포**: `flamingo8006/hwpx-mcp`
- **브랜치**: `worktree-deploy-cloud-rebase` (이전 `claude/deploy-mcp-cloud-CMMZs` 의 main rebase 결과물 — 2026-05-01 머지 완료)
- **마지막 업데이트**: 2026-05-01 — main(v0.5.2 + 인스톨러) 베이스 위에 HTTP 모드 재포팅, HTTP smoke 테스트 6개 추가, 485/485 green

---

## 1. 확정된 아키텍처

Claude.ai / ChatGPT 웹 → `https://ask.dgist.ac.kr/mcp` → nginx → 사내 Docker 컨테이너(127.0.0.1:13701) → 메모리에서만 HWPX 편집.

| 결정 | 값 | 이유 |
|---|---|---|
| 배포 대상 | DGIST AskON 서버 (사내 DMZ) | 이미 공인 도메인 있음, 데이터 주권 |
| 공개 경로 | `ask.dgist.ac.kr/mcp` | 기존 TLS/도메인 재사용 |
| 내부 포트 | `13701` (loopback only) | 사용자 지정 |
| 웹 서버 | nginx | 기존 Askon 프록시 |
| 인증 | Bearer 토큰 (`MCP_TOKEN` / `MCP_TOKENS`) | SSO 없이 진행 |
| 추가 방어 | nginx `limit_req 30r/m` + 선택적 IP 화이트리스트 | 토큰 브루트포스 차단 |
| 스토리지 | 없음 (container `read_only`, `tmpfs:/tmp`) | "저장 하나도 안 되게" 요구 |
| 파일 I/O 방식 | `upload_document_base64` / `download_document_base64` | AI 웹이 파일 소유, MCP는 변환기 |
| 로컬 stdio 모드 | 유지 | 기존 사용자 영향 0, `MCP_MODE` 없으면 자동 stdio |

## 2. 완료된 작업

### 커밋

| 해시 | 설명 |
|---|---|
| `b3c2472` | HTTP 트랜스포트 + dual mode + Docker/nginx/Dockerfile + deploy-dgist.md |
| `662e177` | install-server.md (복붙 기반 설치 가이드) |

### 파일 변경 요약

**신규**
- `mcp-server/src/transport/http.ts` — Express + StreamableHTTPServerTransport, Bearer 인증, CORS, 토큰 해시 로그
- `mcp-server/Dockerfile` — Node 20-alpine, non-root, `read_only` 호환
- `mcp-server/docker-compose.yml` — 루프백 바인딩, `read_only`, `tmpfs`, `cap_drop ALL`
- `mcp-server/.dockerignore`, `mcp-server/.env.example`
- `config/nginx-ask-dgist.conf` — SSE 안전 프록시 + `limit_req`
- `docs/deploy-dgist.md` — 아키텍처/보안 레퍼런스
- `docs/install-server.md` — IT 담당자용 10분 설치 가이드

**수정**
- `mcp-server/src/index.ts` — `MCP_MODE` 분기, `FILESYSTEM_TOOLS` 차단 리스트, `createServer()` 팩토리화, `upload_document_base64` / `download_document_base64` 신규 툴
- `mcp-server/package.json` — `express`, `cors`, SDK ^1.10 추가, 버전 0.5.0
- `mcp-server/package-lock.json` — 의존성 반영
- `.gitignore` — `.env` 보호

### 검증 통과

- `npm install` + `npm run build` 성공 (SDK 1.25.2)
- stdio 모드 `initialize` 응답 정상 → **로컬 사용자 영향 0**
- HTTP 모드: `/health` 200, 미인증 401, Bearer 인증 `initialize` 200

## 3. 남은 작업

### 3-1. ~~AskON 운영 배포 가이드~~ → ✅ AI-HUB 표준 기반 [`docs/deploy-mcp-platform.md`](./deploy-mcp-platform.md) 로 대체 (2026-05-02)

운영 시스템이 AskON 에서 **AI-HUB(`/app/<svc>` + `/data/<svc>` + `dgist-ai` 단일 nginx 파일)** 로 이전되어, 본 항목은 그 표준에 맞춰 다시 작성됨. 도메인도 `ask.dgist.ac.kr/mcp` → `mcp.dgist.ac.kr/hwpx` 로 정리. 향후 외부 공개 MCP 가 늘어도 같은 도메인 + path 분기 (`/<svc>`) 로 누적.

내부 전용 MCP (`mcp-internal.dgist.ac.kr`) 는 별도 트랙으로 분리 — 본 가이드 §부록 B 와 향후 작성될 internal 가이드 참조.

### 3-2. ~~npm publish 가이드~~ — 무효 (2026-05-01)

분기 시점(2026-04-18) 에는 npm 공개 버전이 없었지만, 그 사이 main 에서 `hwpx-mcp-server@0.5.0`/`0.5.1`/`0.5.2` 가 모두 publish 됨. 이 항목은 outdated. 다음 publish 는 HTTP 모드를 안정화한 뒤 `0.5.3` 또는 `0.6.0` 으로 진행.

### 3-3. main 머지 (2026-05-02 신규)

`worktree-deploy-cloud-rebase` 의 4 커밋(HTTP 모드 + 멀티 테넌시 + per-owner cap + TOCTOU fix) + 본 세션의 운영 가이드 정리를 main 에 머지하고 `0.5.3` 또는 `0.6.0` 으로 npm publish. stdio 사용자에게 영향 없음 (회귀 테스트 494/494 green, MCP_MODE 미설정 시 기본 stdio).

## 4. 새 세션에서 이어가는 방법

```bash
# 1. 최신 워크트리 / 브랜치
git checkout worktree-deploy-cloud-rebase
git pull

# 2. 이 파일 읽고 상태 파악
cat docs/_handoff.md

# 3. 빌드 + 테스트로 회귀 0 인지 확인
cd mcp-server && npm install && npm test
```

3-1 만 남은 단일 미해결 항목입니다 (AskON 운영 배포 가이드).

## 5. 주의사항

- `.env` 파일은 절대 커밋 금지 (`.gitignore` 에 등록됨)
- 실제 Bearer 토큰 값은 어디에도 기록 금지 — 서버에서 `openssl rand -hex 32` 생성 후 운영자 보안 채널로 전달
- nginx 스니펫의 `allow 143.248.0.0/16` 같은 IP 대역은 반드시 네트워크팀과 확인 후 적용 (현재는 주석 처리됨)
- 신규 툴 추가 시 파일시스템 I/O 있으면 `FILESYSTEM_TOOLS` Set 에 등록 (안 그러면 HTTP 모드 컨테이너에서 `read_only` 로 실패)

## 6. 합의된 제약

- MCP 서버는 파일을 **어디에도 저장하지 않음** (in-memory Map 만 사용, 컨테이너 FS `read_only`)
- 로컬 stdio 모드와 서버 HTTP 모드는 **같은 코드베이스 + 환경변수 분기**
- Claude.ai 와 ChatGPT 웹 **둘 다** 지원 (CORS 에 두 origin 기본 포함)
