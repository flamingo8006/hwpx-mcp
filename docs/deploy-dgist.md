# HWPX MCP — DGIST 사내 서버 배포 가이드

`ask.dgist.ac.kr/mcp` 경로로 Claude.ai · ChatGPT 웹 Custom Connector에 붙이는 설정입니다.

## 1. 아키텍처 요약

```
[Claude.ai / ChatGPT 웹]
      │  HTTPS + Authorization: Bearer <TOKEN>
      ▼
[ask.dgist.ac.kr]                 ← 기존 DMZ, 기존 TLS 인증서 재사용
      │  nginx location /mcp
      ▼
[127.0.0.1:13701]                 ← docker-compose (loopback only)
      │  hwpx-mcp 컨테이너
      │  · MCP_MODE=http
      │  · read_only FS + tmpfs:/tmp
      │  · 파일시스템 I/O 툴 차단
      └─ 메모리에서만 HWPX 파싱/편집
         → `upload_document_base64` / `download_document_base64`로 왕복
```

- **저장 일절 없음**: 컨테이너 파일시스템이 `read_only`, `/tmp`만 `tmpfs(RAM)`. 문서는 전적으로 Claude/ChatGPT가 관리.
- **로컬 stdio 버전과 병행 운영**: 기존 `npx hwpx-mcp-server` (stdio) 모드는 그대로. 이 배포는 추가 모드일 뿐.

## 2. 사전 준비물

| 항목 | 값 |
|---|---|
| 호스트 | Askon 서버 (리눅스, Docker 설치 필요) |
| 내부 포트 | `13701` (loopback 바인딩) |
| 공개 URL | `https://ask.dgist.ac.kr/mcp` |
| nginx 버전 | 1.18 이상 (http/1.1 + SSE) |
| Bearer 토큰 | `openssl rand -hex 32` 로 생성 |

## 3. 컨테이너 기동

```bash
# 1) 소스 받아오기
git clone -b claude/deploy-mcp-cloud-CMMZs https://github.com/flamingo8006/hwpx-mcp.git
cd hwpx-mcp/mcp-server

# 2) 토큰 생성 + .env 작성
cp .env.example .env
sed -i "s|replace-with-output-of-openssl-rand-hex-32|$(openssl rand -hex 32)|" .env

# 3) 빌드 & 기동
docker compose up -d --build

# 4) 확인
docker compose logs -f hwpx-mcp
curl -s http://127.0.0.1:13701/health   # → {"status":"ok","mode":"http"}
```

정상 로그 예시:
```
[HWPX MCP] HTTP transport listening on :13701/mcp | tokens=[a1b2c3d4] | origins=https://claude.ai,https://chatgpt.com
```

> 토큰 값은 로그에 **절대 출력되지 않습니다** (SHA-256 앞 8자리만 기록).

## 4. nginx 리버스 프록시

### 4-1. `http { }` 블록 (전역)

`/etc/nginx/nginx.conf` 에 레이트 리밋 존이 없으면 한 줄 추가:

```nginx
http {
    # ... 기존 설정 ...
    limit_req_zone $binary_remote_addr zone=mcp_rl:10m rate=30r/m;
}
```

### 4-2. `server { }` 블록 (ask.dgist.ac.kr)

이 리포의 [`config/nginx-ask-dgist.conf`](../config/nginx-ask-dgist.conf) 를 그대로 include 합니다.

```nginx
server {
    listen 443 ssl http2;
    server_name ask.dgist.ac.kr;
    # ... 기존 TLS/Askon 설정 ...

    include /etc/nginx/snippets/hwpx-mcp.conf;
}
```

복사 & 반영:
```bash
sudo cp config/nginx-ask-dgist.conf /etc/nginx/snippets/hwpx-mcp.conf
sudo nginx -t && sudo systemctl reload nginx
```

### 4-3. SSE 관련 주의

location 블록 안의 아래 세 줄은 **반드시** 있어야 합니다 (스니펫에 포함됨):

```nginx
proxy_buffering    off;
proxy_cache        off;
proxy_read_timeout 3600s;
```

없으면 MCP 응답이 중간에 버퍼링되어 Claude/ChatGPT가 타임아웃합니다.

## 5. Claude.ai · ChatGPT 웹 커넥터 등록

구성원에게 **URL과 토큰 한 쌍**을 보안 채널로 전달하세요. 아래는 사용자용 안내입니다.

### Claude.ai (Pro/Team/Enterprise)

1. Settings → **Connectors** → **Add custom connector**
2. 입력:
   - Name: `HWPX (DGIST)`
   - URL: `https://ask.dgist.ac.kr/mcp`
   - Authorization header: `Bearer <발급받은토큰>`
3. 저장 후 대화창에서 HWPX 파일 첨부 → `upload_document_base64` 로 로드 요청 → 편집 → `download_document_base64` 로 받기

### ChatGPT (Plus/Team/Enterprise)

1. Settings → **Connectors** → **Add MCP server**
2. URL · Authorization 동일 입력
3. 이후 흐름 동일

## 6. 사용 흐름 (AI 웹에서)

```
사용자: (report.hwpx 첨부) "3번 표에 제목을 '실적' 으로 바꿔줘"

AI가 자동으로:
  1) upload_document_base64({filename: "report.hwpx", data_base64: "..."})
     → { doc_id: "abc123", format: "hwpx", structure: {...} }

  2) get_tables({doc_id: "abc123"})
     → 3번 표 식별

  3) update_table_cell({doc_id: "abc123", table_index: 2, row: 0, col: 0, text: "실적"})

  4) download_document_base64({doc_id: "abc123"})
     → { data_base64: "..." }

사용자: (수정된 report.hwpx 다운로드)
```

서버 재시작 또는 유휴 시 메모리 내 `doc_id`는 증발합니다. 장기 저장은 AI 웹 쪽에 맡깁니다.

## 7. 보안 방어선

| 레이어 | 통제 |
|---|---|
| nginx | `limit_req 30r/m` + 선택적 IP 화이트리스트 |
| MCP 앱 | Bearer 토큰 (env var), 토큰 해시만 로그 |
| 컨테이너 | `read_only`, `tmpfs:/tmp`, `cap_drop ALL`, `no-new-privileges` |
| 코드 | HTTP 모드에선 `open_document` / `save_document` / `export_to_*` / `insert_image*` 등록 자체를 스킵 |

토큰 유출 시: `.env` 수정 후 `docker compose up -d` — 즉시 무효화.

## 8. 로컬 stdio 모드 유지

이 배포는 기존 로컬 사용에 **영향을 주지 않습니다**. VSCode/Claude Desktop에서 stdio로 쓰던 방식 그대로:

```json
{
  "mcpServers": {
    "hwpx": { "command": "npx", "args": ["-y", "hwpx-mcp-server"] }
  }
}
```

`MCP_MODE` 환경 변수가 없으면 stdio, `MCP_MODE=http` 면 HTTP 서버로 동작합니다.

## 9. 운영 체크리스트

- [ ] `.env` 파일 권한 `chmod 600`, git ignore 확인
- [ ] nginx 리로드 후 `curl -I https://ask.dgist.ac.kr/mcp` 응답 확인 (401이 정상: 인증 없이는 거부)
- [ ] `curl -H "Authorization: Bearer <TOKEN>" https://ask.dgist.ac.kr/mcp` 로 200/202 확인
- [ ] Claude.ai 커넥터 등록 테스트 (툴 목록이 134개가 아닌 128개 — fs 툴 6개 제외된 것이 정상)
- [ ] `docker compose logs hwpx-mcp` 에서 토큰 해시 기록 확인
- [ ] 기관 SIEM으로 nginx `access.log` 수집 설정

## 10. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| Claude에서 "Connection timed out" | nginx SSE 설정 누락 | `proxy_buffering off` 등 3줄 재확인 |
| 401 Unauthorized | 토큰 불일치 | `.env` 값과 커넥터 헤더 비교 |
| 429 Too Many Requests | 레이트 리밋 발동 | `limit_req_zone` rate 상향 또는 `burst` 증가 |
| CORS error | origin 미등록 | `MCP_ALLOWED_ORIGINS` 에 origin 추가 후 재기동 |
| `open_document` 보이지 않음 | HTTP 모드 의도된 동작 | `upload_document_base64` 사용 |
