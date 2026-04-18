# 대화 핸드오프 — HWPX MCP 서버 모드 배포

다른 세션(특히 Obsidian 볼트가 붙은 데스크탑 앱) 에서 이어서 작업하기 위한 상태 기록입니다.

- **리포**: `flamingo8006/hwpx-mcp`
- **브랜치**: `claude/deploy-mcp-cloud-CMMZs`
- **마지막 업데이트**: 2026-04-18

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

### 3-1. DGIST AskON 운영 배포 가이드 (볼트 노트 참조 필요)

사용자님 Obsidian 볼트의 **"DGIST Agentic AI 플랫폼 - AskON 운영 배포 가이드"** 노트를 참조해서 작성해야 함.

현재 세션(원격 샌드박스)에서는 볼트 접근 불가. 새 세션(Obsidian 붙은 데스크탑 앱)에서 진행.

**작성 위치 후보**: `docs/deploy-askon.md`

**포함해야 할 것 (추정)**
- AskON 플랫폼 기준의 표준 배포 절차 (볼트 노트의 섹션 구조에 맞춤)
- MCP 커넥터를 AskON 에 등록하는 방식 (웹 UI 경로 / 설정 파일)
- 변경관리·롤백·보안심사 등 운영팀 표준 섹션
- 로그·모니터링 연동 (SIEM/Grafana 등)
- `docs/install-server.md` 와 중복되는 기술 절차는 참조만 하고 운영적 관점에 집중

### 3-2. npm publish 가이드 (로컬 버전용)

현재 `mcp-server/package.json` 이 이미 npm 배포 가능 상태 (bin 설정, prepublishOnly 스크립트 포함).

**작성 위치 후보**: `docs/publish-npm.md`

**포함해야 할 내용**
- 배포 전 체크리스트 (버전 bump, CHANGELOG, README 업데이트, 빌드 검증)
- 로그인: `npm login` (`flamingo99` 계정)
- 버전 규칙: stdio 전용 변경은 patch, 새 툴 추가는 minor, 호환성 깨지면 major
- `npm publish --access public` (scoped 이름이면 `--access public` 필수)
- 배포 후 검증: `npx -y hwpx-mcp-server` 로 실제 설치 테스트
- 주의: HTTP 모드 코드도 같이 배포되지만 기본값이 stdio 라 무해함. `MCP_TOKEN` 없이는 HTTP 모드가 기동 안 됨
- 롤백 방법: `npm deprecate hwpx-mcp-server@<version> "사유"` (unpublish 는 72시간 이내만 가능)

## 4. 새 세션에서 이어가는 방법

```bash
# 1. 최신 브랜치 받기
git checkout claude/deploy-mcp-cloud-CMMZs
git pull

# 2. 이 파일 읽고 상태 파악
cat docs/_handoff.md
```

Claude Code 에 이렇게 말하면 이어집니다:

> `docs/_handoff.md` 읽고 남은 작업 이어서 해줘. 3-1 은 Obsidian 볼트의 "DGIST Agentic AI 플랫폼 - AskON 운영 배포 가이드" 노트를 참조해서 작성. 3-2 는 바로 진행 가능.

## 5. 주의사항

- `.env` 파일은 절대 커밋 금지 (`.gitignore` 에 등록됨)
- 실제 Bearer 토큰 값은 어디에도 기록 금지 — 서버에서 `openssl rand -hex 32` 생성 후 운영자 보안 채널로 전달
- nginx 스니펫의 `allow 143.248.0.0/16` 같은 IP 대역은 반드시 네트워크팀과 확인 후 적용 (현재는 주석 처리됨)
- 신규 툴 추가 시 파일시스템 I/O 있으면 `FILESYSTEM_TOOLS` Set 에 등록 (안 그러면 HTTP 모드 컨테이너에서 `read_only` 로 실패)

## 6. 합의된 제약

- MCP 서버는 파일을 **어디에도 저장하지 않음** (in-memory Map 만 사용, 컨테이너 FS `read_only`)
- 로컬 stdio 모드와 서버 HTTP 모드는 **같은 코드베이스 + 환경변수 분기**
- Claude.ai 와 ChatGPT 웹 **둘 다** 지원 (CORS 에 두 origin 기본 포함)
