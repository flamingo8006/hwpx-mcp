# 서버 설치 가이드 — HWPX MCP (HTTP 모드)

이 문서는 DGIST IT 담당자가 `ask.dgist.ac.kr/mcp` 로 Claude·ChatGPT 웹 커넥터를 연결하기 위해 서버에 HWPX MCP 를 설치하는 순서입니다. 복붙 기반 10분 가이드입니다.

---

## 사전 확인

| 항목 | 요구 조건 | 확인 명령 |
|---|---|---|
| OS | Linux (Ubuntu 20.04+ / RHEL 8+ 권장) | `uname -a` |
| Docker | 24.0 이상 | `docker --version` |
| Docker Compose | v2 (`docker compose` 커맨드) | `docker compose version` |
| nginx | 1.18 이상 | `nginx -v` |
| 포트 13701 | 미사용 | `ss -lntp \| grep 13701` → 출력 없어야 함 |
| 공개 도메인 | `ask.dgist.ac.kr` HTTPS 동작 | 브라우저 접속 확인 |

> Docker 가 없으면: `curl -fsSL https://get.docker.com \| sh && systemctl enable --now docker`

---

## 1단계. 소스 가져오기

Askon 서버의 관리자 계정 홈(예: `/opt`)에 배치합니다.

```bash
cd /opt
sudo git clone -b claude/deploy-mcp-cloud-CMMZs \
    https://github.com/flamingo8006/hwpx-mcp.git hwpx-mcp
cd hwpx-mcp/mcp-server
```

> 이미 받아둔 리포가 있으면 `git fetch origin && git checkout claude/deploy-mcp-cloud-CMMZs && git pull` 로 갱신.

---

## 2단계. Bearer 토큰 생성 + `.env` 작성

```bash
# 2-1. 토큰 생성 (64자 hex = 256bit)
TOKEN=$(openssl rand -hex 32)
echo "생성된 토큰: $TOKEN"
echo "⚠️  이 값은 구성원에게 보안 채널로 배포, 로그/커밋에 남기지 말 것"

# 2-2. .env 파일 작성
sudo cp .env.example .env
sudo sed -i "s|replace-with-output-of-openssl-rand-hex-32|$TOKEN|" .env

# 2-3. 권한 제한
sudo chmod 600 .env
sudo chown root:root .env

# 2-4. 값 확인 (토큰이 제대로 들어갔는지)
sudo grep ^MCP_TOKEN .env
```

### 구성원별 토큰 여러 개 쓰고 싶다면 (선택)

```bash
# 예: alice, bob 각각 다른 토큰
A=$(openssl rand -hex 24)
B=$(openssl rand -hex 24)
echo "MCP_TOKENS=alice_${A},bob_${B}" | sudo tee -a .env
# MCP_TOKEN 한 줄은 주석 처리
sudo sed -i 's|^MCP_TOKEN=|#MCP_TOKEN=|' .env
```

`MCP_TOKENS` 가 있으면 `MCP_TOKEN` 값은 무시됩니다.

---

## 3단계. 컨테이너 빌드 & 기동

```bash
# 빌드 + 백그라운드 기동
sudo docker compose up -d --build

# 로그 스트리밍 (Ctrl+C 로 빠져나옴 — 컨테이너는 계속 동작)
sudo docker compose logs -f hwpx-mcp
```

**정상 기동 로그 예시**
```
hwpx-mcp  | [HWPX MCP] Server starting - v2-fixed-xml-replacement - 2026-04-18T...
hwpx-mcp  | [HWPX MCP] HTTP transport listening on :13701/mcp | tokens=[a1b2c3d4] | origins=https://claude.ai,https://chatgpt.com
```

> `tokens=[a1b2c3d4]` 는 실제 토큰의 SHA-256 앞 8자리. **원본 토큰은 로그에 절대 남지 않습니다.**

### 기동 검증

```bash
# 헬스체크 (인증 불필요)
curl -s http://127.0.0.1:13701/health
# 기대 출력: {"status":"ok","mode":"http"}

# 인증 미포함 → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:13701/mcp \
    -H "Content-Type: application/json" -d '{}'
# 기대 출력: 401

# 인증 포함 initialize → 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:13701/mcp \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
# 기대 출력: 200
```

3개 모두 통과하면 컨테이너 단계 완료.

---

## 4단계. nginx 리버스 프록시 설정

### 4-1. 레이트 리밋 존 (전역, 한 번만)

`/etc/nginx/nginx.conf` 의 `http { }` 블록 안에 존이 없으면 추가:

```bash
sudo grep -q "zone=mcp_rl" /etc/nginx/nginx.conf || \
  sudo sed -i '/^http {/a\    limit_req_zone $binary_remote_addr zone=mcp_rl:10m rate=30r/m;' \
  /etc/nginx/nginx.conf
```

확인:
```bash
sudo grep mcp_rl /etc/nginx/nginx.conf
```

### 4-2. MCP location 스니펫 설치

```bash
sudo mkdir -p /etc/nginx/snippets
sudo cp /opt/hwpx-mcp/config/nginx-ask-dgist.conf /etc/nginx/snippets/hwpx-mcp.conf
```

### 4-3. ask.dgist.ac.kr server 블록에 include

`ask.dgist.ac.kr` 를 서빙하는 nginx 설정 파일(보통 `/etc/nginx/sites-enabled/ask.dgist.ac.kr` 또는 `/etc/nginx/conf.d/askon.conf`)의 `server { }` 블록 맨 끝에 한 줄 추가:

```nginx
server {
    listen 443 ssl http2;
    server_name ask.dgist.ac.kr;
    # ... 기존 SSL / Askon 설정 ...

    include /etc/nginx/snippets/hwpx-mcp.conf;    # <-- 이 줄 추가
}
```

### 4-4. 문법 검증 후 리로드

```bash
sudo nginx -t            # syntax is ok + test is successful 확인
sudo systemctl reload nginx
```

### 4-5. 외부에서 접근 검증

```bash
# 인증 없이: 401 예상
curl -s -o /dev/null -w "no-auth: %{http_code}\n" \
     -X POST https://ask.dgist.ac.kr/mcp -H "Content-Type: application/json" -d '{}'

# 인증 포함: 200 예상
curl -s -o /dev/null -w "with-auth: %{http_code}\n" \
     -X POST https://ask.dgist.ac.kr/mcp \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

401 / 200 가 각각 나오면 전체 경로가 뚫린 것.

---

## 5단계. Claude.ai / ChatGPT 커넥터 등록 테스트

### Claude.ai (Pro/Team/Enterprise 필요)

1. 설정 → **Connectors** → **Add custom connector**
2. 입력값:
   - Name: `HWPX (DGIST)`
   - URL: `https://ask.dgist.ac.kr/mcp`
   - Authorization: `Bearer <TOKEN>`
3. 저장 후 새 대화에서 "tools" 아이콘을 누르면 **128 개 툴** 표시되면 정상 (전체 134 개에서 파일시스템 툴 6 개 제외됨)

### ChatGPT (Plus/Team/Enterprise 필요)

1. 설정 → **Connectors** → **Add MCP server**
2. 동일 URL / Authorization 입력
3. 새 대화에서 HWPX 파일 첨부 후 "표 편집해줘" 등 지시로 테스트

**첫 왕복 테스트**
1. 채팅창에 `.hwpx` 첨부
2. "이 문서의 구조를 분석해줘" 요청
3. AI 가 `upload_document_base64` → `get_document_structure` 호출 → 결과 반환되면 성공

---

## 6단계. 운영 체크리스트

- [ ] `sudo ls -l /opt/hwpx-mcp/mcp-server/.env` → `-rw-------` 확인
- [ ] `sudo docker compose ps` → `hwpx-mcp` 가 `Up (healthy)` 상태
- [ ] `sudo docker compose logs --tail 50 hwpx-mcp` → 에러 없음
- [ ] 기관 SIEM 에 `/var/log/nginx/access.log` 수집 대상 추가
- [ ] 시스템 부팅 시 자동 기동: `sudo systemctl enable docker` (docker-compose 는 `restart: unless-stopped` 덕분에 자동 재시작)
- [ ] 월 1회: `sudo docker image prune -f` 로 오래된 이미지 정리
- [ ] 분기 1회: 토큰 로테이션 (아래 참고)

---

## 운영 작업 매뉴얼

### 업데이트 배포

```bash
cd /opt/hwpx-mcp
sudo git pull origin claude/deploy-mcp-cloud-CMMZs
cd mcp-server
sudo docker compose up -d --build
sudo docker compose logs --tail 30 hwpx-mcp
```

빌드 시간 ~1분. 기존 세션은 끊어지므로 업무 시간 외에 권장.

### 토큰 로테이션

```bash
NEW=$(openssl rand -hex 32)
sudo sed -i "s|^MCP_TOKEN=.*|MCP_TOKEN=$NEW|" /opt/hwpx-mcp/mcp-server/.env
sudo docker compose -f /opt/hwpx-mcp/mcp-server/docker-compose.yml up -d
# 새 토큰을 구성원에게 배포
```

구 토큰은 컨테이너 재시작 즉시 무효화됩니다.

### 로그 확인

```bash
# 앱 로그 (tokens=[해시] 기록됨)
sudo docker compose logs -f hwpx-mcp

# 접근 로그 (IP, 응답 코드, 응답 크기)
sudo tail -f /var/log/nginx/access.log | grep ' /mcp'

# 거부된 요청 (레이트 리밋, 401)
sudo grep ' /mcp ' /var/log/nginx/access.log | awk '$9 >= 400'
```

### 정지 / 제거

```bash
# 일시 정지
sudo docker compose -f /opt/hwpx-mcp/mcp-server/docker-compose.yml stop

# 완전 제거 (컨테이너 + 볼륨)
sudo docker compose -f /opt/hwpx-mcp/mcp-server/docker-compose.yml down -v

# nginx 에서 제거
sudo sed -i '/include \/etc\/nginx\/snippets\/hwpx-mcp.conf;/d' \
    /etc/nginx/sites-enabled/ask.dgist.ac.kr
sudo nginx -t && sudo systemctl reload nginx
```

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `docker compose up` 가 포트 충돌 | 13701 이 이미 사용 중 | `ss -lntp \| grep 13701` 로 점유 프로세스 확인 |
| `curl /health` 응답 없음 | 컨테이너가 기동 실패 | `docker compose logs hwpx-mcp` 확인. 대부분 `.env` 의 `MCP_TOKEN` 누락 |
| 401 with 정상 토큰 | `.env` 의 토큰과 커넥터의 토큰 불일치 (공백·줄바꿈) | `grep ^MCP_TOKEN .env` 로 정확한 값 재확인 |
| Claude 에서 "Connection timed out" | nginx SSE 설정 누락 | `/etc/nginx/snippets/hwpx-mcp.conf` 의 `proxy_buffering off` 외 3줄 확인 |
| 429 Too Many Requests | 레이트 리밋 발동 (30/분 초과) | `nginx.conf` 의 `rate=30r/m` 을 `60r/m` 등으로 상향 후 리로드 |
| CORS 에러 | 비표준 origin 에서 접근 | `.env` 의 `MCP_ALLOWED_ORIGINS` 에 추가, `docker compose up -d` 재기동 |
| 툴 목록에 `open_document` 가 안 보임 | HTTP 모드 의도된 동작 | `upload_document_base64` 사용 안내 |
| 큰 HWPX 업로드 실패 | base64 크기가 50MB 초과 | `.env` 에 `MCP_MAX_BODY_MB=100` 추가 + nginx `client_max_body_size` 상향 |

---

## 참고

- 아키텍처 · 보안 모델 상세: [`docs/deploy-dgist.md`](./deploy-dgist.md)
- nginx 스니펫 원본: [`config/nginx-ask-dgist.conf`](../config/nginx-ask-dgist.conf)
- 로컬 stdio 모드는 이 배포와 **완전히 독립**. 기존 VSCode·Claude Desktop 사용자는 아무 영향 없음
