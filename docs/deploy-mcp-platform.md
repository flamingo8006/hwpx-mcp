# DGIST MCP 플랫폼 운영 배포 가이드

> DGIST 구성원을 위한 외부 공개 MCP 서버 운영 표준 — Docker 기반 On-Premise + 단일 도메인 멀티 MCP 패턴
>
> **외부 공개 MCP 전용** — 업무 시스템 연계용 내부 전용 MCP 는 별도 인프라(`mcp-internal.dgist.ac.kr`)에서 운영하며 본 가이드 적용 대상이 아닙니다.

## 문서 버전

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| v1.0 | 2026-05-02 | 초기 작성 — `ask.dgist.ac.kr/mcp` → `mcp.dgist.ac.kr/hwpx` 도메인 정책 정리, AI-HUB 운영 표준(`/app`·`/data` 분리, `dgist-ai` 단일 nginx 파일) 채택 |

---

## 목차

1. [배포 전략 개요](#1-배포-전략-개요)
2. [사전 요구 사항](#2-사전-요구-사항)
3. [서버 초기 설정](#3-서버-초기-설정)
4. [환경변수 설정](#4-환경변수-설정)
5. [Docker 이미지 빌드](#5-docker-이미지-빌드)
6. [배포 방법](#6-배포-방법)
7. [Health Check 및 모니터링](#7-health-check-및-모니터링)
8. [리버스 프록시 (Nginx)](#8-리버스-프록시-nginx)
9. [Claude.ai · ChatGPT Custom Connector 등록](#9-claudeai--chatgpt-custom-connector-등록)
10. [CI/CD 파이프라인](#10-cicd-파이프라인)
11. [운영 관리](#11-운영-관리)
12. [트러블슈팅](#12-트러블슈팅)
13. [보안 체크리스트](#13-보안-체크리스트)
14. [부록 A — 신규 외부 MCP 추가 절차](#부록-a--신규-외부-mcp-추가-절차)
15. [부록 B — 내부 전용 MCP 와의 차이](#부록-b--내부-전용-mcp-와의-차이)
16. [부록 C — AI-HUB 와의 차이](#부록-c--ai-hub-와의-차이)

---

## 1. 배포 전략 개요

### 1-1. 도메인 정책

```
mcp.dgist.ac.kr (외부 공개 — Claude.ai/ChatGPT Custom Connector 대상)
├── /hwpx   → 127.0.0.1:13701 (hwpx-mcp 컨테이너)
├── /<svc>  → 127.0.0.1:1370x (향후 추가될 외부 공개 MCP)
└── /health → 게이트웨이 자체 헬스 (각 MCP 의 /health 집계, 향후)
```

| 항목 | 값 | 이유 |
|---|---|---|
| 외부 도메인 | `mcp.dgist.ac.kr` | 공인 와일드카드 인증서(`*.dgist.ac.kr`) 가정. AI-HUB 와 동일 표준 |
| MCP 별 분리 | path 분기 (`/hwpx`, `/<svc>`) | 도메인 1개 + 인증서 1장으로 N개 MCP 운영. nginx 한 server block 에 location 누적 |
| 컨테이너 격리 | 별도 컨테이너 + 별도 loopback 포트 | 한 MCP 장애가 다른 MCP 에 전파되지 않음 |
| 토큰 격리 | MCP 별 `MCP_TOKEN` 분리 발급 | 한 토큰 유출 시 영향 범위를 그 MCP 로 한정 |
| Custom Connector URL | `https://mcp.dgist.ac.kr/<svc>` | 사용자가 외울 패턴 1개. 추가 MCP 도 동일 prefix |

### 1-2. 외부 vs 내부 MCP

본 가이드는 **외부 공개 MCP 만** 다룹니다. 사내 업무 시스템(학사 DB, 인사·재무, 메일 등) 과 연계하는 MCP 는 다음과 같이 **인프라부터 분리** — 가급적 **물리/논리적으로 별도 호스트** 에 배치합니다. nginx `allow/deny` 만으로는 root·Docker daemon·커널·파일시스템 신뢰 경계를 분리하지 못하므로, 같은 호스트 공유는 다음 §1-3 의 임시 예외 절차 외에는 권장하지 않습니다.

| 레이어 | 외부 공개 MCP (본 가이드) | 내부 전용 MCP (별도 트랙) |
|---|---|---|
| 도메인 | `mcp.dgist.ac.kr` (공인 DNS) | `mcp-internal.dgist.ac.kr` (사내 DNS / split-horizon) |
| 인증서 | 공인 CA (Let's Encrypt 또는 학내 표준 CA) | 사내 CA |
| 방화벽 | 80/443 외부 허용 | 학내 대역(`10.0.0.0/8` 등) + VPN pool 만 |
| nginx listen | `0.0.0.0:443` | 외부 NIC 에 listen 자체 안 함 |
| Bearer 토큰 | 사용자별 발급 + 관리자 회전 | MFA/SSO 연동(예: ai-auth 위에서 토큰 발급) |
| 코드 저장소 | 공개 GitHub (`flamingo8006/hwpx-mcp`) | 사내 GitHub Enterprise / GitLab |
| Custom Connector 가능 여부 | Claude.ai · ChatGPT 등록 가능 | 외부 AI 등록 **불가** (도메인 자체 비공개) |

내부 전용 MCP 가이드는 별도 문서로 작성 예정.

### 1-3. 임시 동일 호스트 공유 (예외 절차)

물리 분리가 즉시 불가능해 외부·내부 MCP 가 한동안 같은 호스트에서 공존해야 한다면, 다음 모두 충족 시에만 운영 부서장 결재 후 **만료일 명시 임시 운영** 합니다:

- 외부·내부 MCP 컨테이너를 **별도 Docker network** 로 격리 (외부 net 에서 내부 net 으로 라우팅 불가, ICC 차단)
- 내부 nginx server block 은 **별도 인터페이스/IP/VLAN 에 bind** (예: `listen 10.110.x.y:443 ssl;`). 단일 IP 호스트라면 본 예외를 **적용 불가** — 별도 호스트 분리가 강제.
- 호스트 방화벽(ufw/firewalld)에서 외부 NIC 로의 internal 포트 inbound 차단 (nginx allow/deny 와 별개의 OS 레벨 분리선)
- AppArmor/SELinux 프로파일로 컨테이너 mount 경로 분리
- 내부 MCP 의 모든 API 호출 풀 로그 + SIEM 전송
- 분기 1회 침투 테스트로 인프라 분리 시점까지 추적
- **결재 문서에 만료일 명기** (최대 6개월), 만료 30일 전 재결재 또는 호스트 분리 마무리

이 항목 중 하나라도 미충족이거나 만료일 경과면 동일 호스트 운영 금지. 별도 호스트 분리가 정답.

---

## 2. 사전 요구 사항

| 항목 | 최소 사양 | 권장 사양 |
|------|----------|----------|
| OS | Linux (Ubuntu 22.04+, RHEL 8+) | Ubuntu 24.04 LTS |
| Docker | 24.0+ | 최신 안정 버전 |
| Docker Compose | v2.20+ | 최신 안정 버전 |
| Git | 2.30+ | 최신 안정 버전 |
| Node.js | (Docker 이미지 내장) | node:20-alpine |
| nginx | 1.18+ | 학내 표준 (`/etc/nginx/sites-available/dgist-ai`) |
| CPU | 1 core / MCP | 2 cores / MCP |
| RAM | 512 MB / MCP | 1 GB / MCP |
| Disk | 2 GB | 10 GB+ (이미지 + 로그) |

```bash
# 필수 도구 버전 확인
docker --version
docker compose version
git --version
nginx -v

# Docker 가 없다면 설치 (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

> **AI-HUB 와의 차이**: hwpx-mcp 는 **DB·MinIO·Auth 가 없습니다**. 메모리에서만 동작하는 stateless 서버로, 컨테이너 1개 + nginx 한 location 만 추가됩니다. RAM 도 훨씬 적게 씁니다.

---

## 3. 서버 초기 설정

### 3-1. 디렉토리 구조 (학내 표준)

AI-HUB 와 동일하게 **코드는 `/app/mcp/<svc>`, 영속 데이터·로그·백업은 `/data/mcp/<svc>/*`** 로 분리.

```bash
# 코드용
sudo mkdir -p /app/mcp/hwpx
sudo chown $(whoami):$(whoami) /app/mcp/hwpx

# 운영 데이터용 (logs 만 — DB·MinIO 없으므로 단순)
sudo mkdir -p /data/mcp/hwpx/{logs,backup}
sudo chown -R $(id -u):$(id -g) /data/mcp/hwpx
```

| 경로 | 용도 |
|---|---|
| `/app/mcp/hwpx` | 소스코드 (git clone 대상) |
| `/data/mcp/hwpx/logs` | 컨테이너 로그 마운트 (json-file driver 외 보존본) |
| `/data/mcp/hwpx/backup` | (선택) `.env` 스냅샷 저장 |

### 3-2. 소스 클론

```bash
cd /app/mcp/hwpx
git clone https://github.com/flamingo8006/hwpx-mcp.git .

# HTTP 모드는 별도 브랜치에 있을 수 있음 (main 머지 전)
git checkout worktree-deploy-cloud-rebase   # 또는 main 머지 후엔 main
git pull
```

> **저장소 가시성**: 외부 공개 MCP 코드는 GitHub public 저장소를 그대로 사용. 사내 시스템 스키마/API 가 들어가는 내부 MCP 만 사내 저장소로 이전.

### 3-3. 디렉토리 구조 확인

```bash
ls -la /app/mcp/hwpx/mcp-server/
# 필수 파일:
#   Dockerfile
#   docker-compose.yml
#   package.json + package-lock.json
#   .env.example
#   src/transport/http.ts
```

---

## 4. 환경변수 설정

### 4-1. .env 파일 생성

```bash
cd /app/mcp/hwpx/mcp-server
cp .env.example .env
chmod 600 .env
```

### 4-2. Bearer 토큰 + 운영 도메인 sed 일괄 주입

```bash
cd /app/mcp/hwpx/mcp-server

# === Bearer 토큰 생성 (64자 hex = 256bit) ===
sed -i "s|^MCP_TOKEN=.*|MCP_TOKEN=$(openssl rand -hex 32)|" .env

# === 도메인·CORS — Claude.ai + ChatGPT 만 허용 ===
# 기본값이 이미 맞으므로 .env 의 MCP_ALLOWED_ORIGINS 라인은 보통 그대로 둠.
# 다른 origin 도 허용하려면 주석 해제 후 콤마 연결:
# sed -i "s|^# *MCP_ALLOWED_ORIGINS=.*|MCP_ALLOWED_ORIGINS=https://claude.ai,https://chatgpt.com,https://your-other-origin|" .env

# === 운영 캡 (옵션) ===
# 글로벌·Per-owner 둘 다 환경변수로 조정 가능. 미설정 시 200/50 default.
# echo "MCP_MAX_OPEN_DOCS=200" >> .env
# echo "MCP_MAX_OPEN_DOCS_PER_OWNER=50" >> .env

# === 검증 + 누출 점검 ===
grep -E '^(MCP_TOKEN|MCP_TOKENS|MCP_ALLOWED_ORIGINS)=' .env
git check-ignore -v .env       # → .gitignore 매치 (mcp-server/.env / .env.local 둘 다 등록됨)
ls -la .env                    # → -rw-------

# 셸 history 흔적 정리
history -c && history -w
```

> [!warning] 토큰 보관
> - 위 sed 실행 직후 `.env` 의 `MCP_TOKEN` 평문은 ITC 표준 vault (1Password / Bitwarden / 사내 비밀 관리) 로 옮겨 보관.
> - 사용자에게 배포할 때는 vault 의 공유 항목을 보안 채널(메일 X, Slack DM X — Bitwarden Send 또는 1Password share link)로 전달.

### 4-3. 구성원별 토큰 여러 개 (선택)

회수·감사 단위를 사용자별로 가져가려면 `MCP_TOKEN` 대신 `MCP_TOKENS` 사용:

```bash
# alice, bob, carol 각자 다른 토큰
sed -i 's|^MCP_TOKEN=.*|# MCP_TOKEN=disabled|' .env

ALICE=$(openssl rand -hex 24)
BOB=$(openssl rand -hex 24)
CAROL=$(openssl rand -hex 24)

cat <<EOF | sudo tee -a .env
MCP_TOKENS=${ALICE},${BOB},${CAROL}
EOF

# 사용자별로 vault 항목 만들고 본인 토큰만 공유
echo "alice -> ${ALICE}"
echo "bob   -> ${BOB}"
echo "carol -> ${CAROL}"
```

서버 로그에는 토큰 평문이 아니라 **SHA-256 prefix 8자만 남으므로**, 어떤 사용자가 호출했는지 매칭하려면 vault 에 토큰 ↔ 사용자 매핑을 별도 보관해야 합니다. 멀티 테넌시 격리(`docOwners`)는 토큰 해시 단위로 자동 적용되므로 alice 가 만든 doc_id 는 bob 에게 보이지 않습니다.

### 4-4. 필수 환경변수 요약

| 키 | 기본값 | 설명 |
|---|---|---|
| `MCP_MODE` | `http` (compose에서 강제) | `stdio` 면 로컬 모드, `http` 면 HTTP 서버 |
| `MCP_TOKEN` | (없음 — 필수) | Bearer 토큰. `MCP_TOKENS` 가 우선 |
| `MCP_TOKENS` | (없음) | 콤마 구분 다중 토큰. 사용자별 분리·회전 |
| `MCP_PORT` | `13701` | 컨테이너 내부 listen 포트. nginx 가 이 포트로 proxy |
| `MCP_PATH` | `/mcp` | MCP endpoint path. nginx 에서 strip 하므로 그대로 둠 |
| `MCP_MAX_BODY_MB` | `50` | 업로드 최대 크기. 더 큰 hwpx 는 사용자에게 분할 안내 |
| `MCP_ALLOWED_ORIGINS` | `https://claude.ai,https://chatgpt.com` | CORS allowlist. `*` 비권장 |
| `MCP_MAX_OPEN_DOCS` | `200` | 글로벌 동시 오픈 문서 수 (호스트 메모리 보호) |
| `MCP_MAX_OPEN_DOCS_PER_OWNER` | `50` | 토큰당 동시 오픈 문서 수 (DoS 방어) |

---

## 5. Docker 이미지 빌드

### 5-1. 빌드 구조

`mcp-server/Dockerfile` 은 Node 20-alpine multi-stage:

```
Stage 1 (builder) : npm ci + tsc 빌드
Stage 2 (runner)  : dist + node_modules (production) 만 복사 (~150 MB)
                    non-root 사용자 (uid 1001), read_only FS 호환
```

### 5-2. 이미지 빌드

```bash
cd /app/mcp/hwpx/mcp-server

# 빌드 (env-file 명시 — POSTGRES_PASSWORD 같은 required 변수가 없어도 형식 통일)
docker compose --env-file .env build

# 캐시 무시 (의존성 변경 시)
docker compose --env-file .env build --no-cache
```

### 5-3. 이미지 확인

```bash
docker images hwpx-mcp
# REPOSITORY   TAG       SIZE
# hwpx-mcp     latest    ~150MB
```

---

## 6. 배포 방법

> **Alias 설정**: 매번 `--env-file .env` 입력 안 하려면 본인 셸 rc 파일에:
> ```bash
> # bash
> echo "alias dcm='docker compose --env-file .env'" >> ~/.bashrc && source ~/.bashrc
>
> # zsh
> echo "alias dcm='docker compose --env-file .env'" >> ~/.zshrc && source ~/.zshrc
> ```
> 이후 `dcm ps`, `dcm up -d`, `dcm logs hwpx-mcp` 로 단축 호출.

### 6-1. 시작·중지

```bash
cd /app/mcp/hwpx/mcp-server

# 시작 (이미지 빌드 + 실행)
dcm up -d --build

# 상태 확인
dcm ps

# 로그 확인 (실시간)
dcm logs -f hwpx-mcp

# 중지
dcm down

# 중지 + 이미지까지 정리 (볼륨 없음 — 메모리만 사용)
dcm down --rmi local
```

### 6-2. compose 구성

`docker-compose.yml`:

| 서비스 | 이미지 | 포트 | 비고 |
|--------|--------|------|------|
| `hwpx-mcp` | Dockerfile 빌드 (node:20-alpine) | `127.0.0.1:13701:13701` | **loopback only**. nginx 가 유일한 외부 진입점 |

보안 하드닝 적용 항목:
- `read_only: true` + `tmpfs:/tmp:64m` — 컨테이너 FS 쓰기 금지 (메모리만 사용하는 설계와 일치)
- `cap_drop: [ALL]` + `no-new-privileges` — 권한 상승 차단
- `mem_limit: 512m` + `cpus: 1.0` — 자원 캡
- json-file 로그 10MB × 5 rotation

### 6-3. 최초 배포 흐름

```bash
# 1. 디렉토리 + 클론
sudo mkdir -p /app/mcp/hwpx /data/mcp/hwpx/logs
sudo chown $(id -u):$(id -g) /app/mcp/hwpx /data/mcp/hwpx
cd /app/mcp/hwpx
git clone https://github.com/flamingo8006/hwpx-mcp.git .

# 2. 환경변수
cd mcp-server
cp .env.example .env
chmod 600 .env
sed -i "s|^MCP_TOKEN=.*|MCP_TOKEN=$(openssl rand -hex 32)|" .env

# 3. 컨테이너 시작
dcm up -d --build

# 4. Health check
curl -s http://127.0.0.1:13701/health | jq
# {"status": "ok", "mode": "http"}

# 5. 인증 동작 확인 (예상: 401)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:13701/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
# 401

# 6. Bearer 통과 확인
TOKEN=$(grep ^MCP_TOKEN .env | cut -d= -f2)
curl -s -X POST http://127.0.0.1:13701/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
# event: message
# data: {"result":{...,"serverInfo":{"name":"hwpx-mcp-server",...}},...}
```

> **stateless 설계 확인**: 컨테이너를 `dcm down && dcm up -d` 한 직후 `/health` 가 즉시 200 으로 떠야 합니다. DB 마이그레이션·시드 같은 단계가 없으므로 헬스체크가 늦게 통과한다면 환경변수/토큰 설정 오류입니다.

---

## 7. Health Check 및 모니터링

### 7-1. Health 엔드포인트

`/health` — 인증 없이 호출 가능 (헬스체크는 외부 monitor 가 ping 해야 하므로).

```bash
curl http://localhost:13701/health
# {"status":"ok","mode":"http"}
```

200 이외 응답이면 컨테이너 또는 nginx 단에서 문제 발생. 로그 확인:

```bash
dcm logs --tail=100 hwpx-mcp
```

### 7-2. UptimeRobot — 다운 알림 (5분, 무료)

`https://uptimerobot.com` 무료 플랜으로 충분 (50 monitor).

1. **+ Add New Monitor**:
   - Type: HTTP(s)
   - URL: `https://mcp.dgist.ac.kr/hwpx/health`
     (nginx 의 `/hwpx/health` location 이 컨테이너 `/health` 로 proxy)
   - Interval: 5분
   - Alert Contact: `itc@dgist.ac.kr`
2. 다운 ≥1회 (5분) → 즉시 이메일

### 7-3. 사내 systemd timer 대체 (외부 SaaS 안 될 때)

```ini
# /etc/systemd/system/hwpx-mcp-uptime.service
[Service]
Type=oneshot
ExecStart=/bin/bash -c '\
  curl -fsS https://mcp.dgist.ac.kr/hwpx/health > /dev/null \
    || mail -s "[hwpx-mcp] /health DOWN" itc@dgist.ac.kr < /dev/null \
'

# /etc/systemd/system/hwpx-mcp-uptime.timer
[Unit]
Description=hwpx-mcp uptime probe (every 5 min)

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hwpx-mcp-uptime.timer
```

### 7-4. 메모리 사용 감시

stateless 라 평소엔 가벼우나, 사용자가 close 안 한 doc 이 누적되면 cap (200) 까지 RAM 점유. 매일 03:00 cron 으로 재기동하는 것을 운영 정책으로 권장:

```bash
# /etc/cron.d/hwpx-mcp-restart
0 3 * * * dgistai cd /app/mcp/hwpx/mcp-server && /usr/bin/docker compose --env-file .env restart hwpx-mcp >> /data/mcp/hwpx/logs/cron-restart.log 2>&1
```

cap (`MCP_MAX_OPEN_DOCS=200` 글로벌, `MCP_MAX_OPEN_DOCS_PER_OWNER=50` 토큰당) 이 1차 방어선이고, 일일 재기동이 2차 방어선.

> **확장 시 주의**: 일일 재기동은 활성 사용자 세션을 강제로 끊어버리므로, 사용량이 늘어 24시간 이상 활성 doc 이 흔해지면 **per-doc TTL 기반 idle eviction 을 코드에 구현하는 것이 정답**. 본 가이드 v1.0 시점에는 미구현 — 운영 부하 모니터링 후 우선순위 조정.

---

## 8. 리버스 프록시 (Nginx) — 학내 표준 `dgist-ai` 단일 파일 패턴

학내 nginx 는 **모든 DGIST AI 도메인을 `/etc/nginx/sites-available/dgist-ai` 단일 파일에 누적**해서 운영 (askON·studio·chat·ai-auth·ai-hub 등). hwpx-mcp 도 별도 `.conf` 파일을 만들지 않고 **이 파일 끝에 `mcp.dgist.ac.kr` server block 1개를 추가**하고, 그 안에 `/hwpx` location 을 둡니다. 향후 `/calendar` 등 신규 MCP 가 늘어도 location 만 추가.

| 항목 | 학내 표준 |
|---|---|
| **파일 위치** | `/etc/nginx/sites-available/dgist-ai` (단일 파일) + sites-enabled symlink |
| **SSL 인증서** | `/app/nginx/ssl/fullchain.crt` + `/app/nginx/ssl/server.key` (와일드카드 또는 multi-SAN) |
| **TLS** | `TLSv1.2 TLSv1.3` |
| **ciphers** | `HIGH:!aNULL:!MD5` |
| **listen** | `443 ssl` |
| **upstream** | 안 씀 — 직접 `proxy_pass http://127.0.0.1:PORT;` |
| **proxy header** | Host / X-Real-IP / X-Forwarded-For / X-Forwarded-Proto |
| **HSTS** | 추가 (Bearer 인증 보호 대상) |
| **client spoofing 차단** | askON 패턴 — 클라이언트 임의 헤더 강제 빈 값 |

### 8-1. SSL 인증서 SAN 확인

```bash
openssl x509 -in /app/nginx/ssl/fullchain.crt -noout -text \
  | grep -A1 "Subject Alternative Name\|Subject:"
```

기대 결과:
- **와일드카드** `Subject: CN = *.dgist.ac.kr` 또는 SAN `DNS:*.dgist.ac.kr` → `mcp.dgist.ac.kr` 자동 커버 ✅
- **multi-SAN** 에 `mcp.dgist.ac.kr` 가 없으면 → SAN 추가 발급 필요 ⚠️

### 8-2. mcp.dgist.ac.kr 추가용 server block

`/etc/nginx/sites-available/dgist-ai` 파일 **끝에 추가**. 향후 신규 MCP 추가 시 이 server block 안의 `# === MCP 등록 영역 ===` 아래에 location 만 더 적습니다.

```nginx
	# ===== mcp.dgist.ac.kr (외부 공개 MCP 게이트웨이) =====
	server {
	    listen 80;
	    server_name mcp.dgist.ac.kr;
	    return 301 https://$host$request_uri;
	}
	
	server {
	    listen 443 ssl;
	    server_name mcp.dgist.ac.kr;
	
	    ssl_certificate     /app/nginx/ssl/fullchain.crt;
	    ssl_certificate_key /app/nginx/ssl/server.key;
	    ssl_protocols       TLSv1.2 TLSv1.3;
	    ssl_ciphers         HIGH:!aNULL:!MD5;
	
	    # 보안 헤더
	    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
	    add_header X-Frame-Options              "DENY" always;
	    add_header X-Content-Type-Options       "nosniff" always;
	    add_header Referrer-Policy              "strict-origin-when-cross-origin" always;
	
	    # MCP 메시지 본문 한계 (.env MCP_MAX_BODY_MB 와 일치)
	    client_max_body_size 50m;
	
	    # 정찰 차단 — 등록되지 않은 path 는 404 즉시
	    location = / {
	        return 404;
	    }
	
	    # IP 별 rate limit (50 r/m, burst 10) — 토큰 brute force 완화
	    # ※ http {} 블록 상단에 limit_req_zone 정의 필요 (§8-3)
	    limit_req zone=mcp_per_ip burst=10 nodelay;
	
	    # ============================================================
	    # === MCP 등록 영역 — 신규 외부 MCP 추가 시 location 만 추가 ===
	    # ============================================================
	
	    # ----- /hwpx → hwpx-mcp 컨테이너 (port 13701) -----
	    location /hwpx/ {
	        proxy_pass         http://127.0.0.1:13701/;     # 후행 슬래시: nginx 가 /hwpx prefix 제거 후 컨테이너로 전달
	        proxy_http_version 1.1;
	        proxy_set_header   Host              $host;
	        proxy_set_header   X-Real-IP         $remote_addr;
	        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
	        proxy_set_header   X-Forwarded-Proto $scheme;
	
	        # SSE (Streamable HTTP) 호환
	        # - Connection "" : nginx 의 default 'Connection: close' 가 keepalive 끊지 않도록 비움
	        # - proxy_buffering off : SSE chunk 즉시 클라이언트에게 흘려보냄
	        # - 긴 read/send timeout : 장시간 idle 상태인 SSE 스트림 끊김 방지
	        proxy_set_header   Connection        "";
	        proxy_buffering    off;
	        proxy_cache        off;
	        proxy_read_timeout 600s;
	        proxy_send_timeout 600s;
	
	        # 클라이언트 spoofing 방지 (askON 패턴 — defense in depth)
	        proxy_set_header X-User-Id        "";
	        proxy_set_header X-User-Login-Id  "";
	        proxy_set_header X-User-Name      "";
	        proxy_set_header X-User-Role      "";
	        proxy_set_header X-Auth-Source    "";
	    }
	
	    # ----- /<future-svc>/ → 다음 외부 MCP 추가 시 여기에 -----
	    # location /<svc>/ {
	    #     proxy_pass         http://127.0.0.1:1370x/;
	    #     ... (위 hwpx 와 동일 패턴)
	    # }
	}
```

### 8-3. http{} 상단의 rate limit zone (한 번만 정의)

`/etc/nginx/nginx.conf` 또는 `/etc/nginx/conf.d/00-zones.conf` 의 `http{}` 안에 (없으면 추가):

```nginx
limit_req_zone $binary_remote_addr zone=mcp_per_ip:10m rate=50r/m;
```

50 r/m 은 정상 사용자가 충분히 여유롭게 쓸 수 있는 값이면서 토큰 brute force 시도(초당 수천 회)는 즉시 차단되는 수치. 운영 첫 1주 모니터링 후 조정.

### 8-4. 적용

```bash
# 1) 기존 dgist-ai 파일 백업
sudo cp /etc/nginx/sites-available/dgist-ai \
        /etc/nginx/sites-available/dgist-ai.bak.$(date +%Y%m%d)

# 2) 파일 끝에 위 server block 추가
sudo vim /etc/nginx/sites-available/dgist-ai
# → 파일 맨 아래(`G`) 로 이동 후 §8-2 server block 통째로 붙여넣기

# 3) sites-enabled symlink 확인
ls -la /etc/nginx/sites-enabled/dgist-ai
# 없으면: sudo ln -s /etc/nginx/sites-available/dgist-ai /etc/nginx/sites-enabled/

# 4) 검증·리로드
sudo nginx -t
sudo systemctl reload nginx
```

### 8-5. 검증

```bash
# 외부에서 (Mac 노트북 등)
curl -I  https://mcp.dgist.ac.kr/                    # 404 (의도)
curl -I  https://mcp.dgist.ac.kr/hwpx/health         # 200 OK
curl -i  -X POST https://mcp.dgist.ac.kr/hwpx/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
# HTTP/2 401 (인증 누락)

# Bearer 통과
TOKEN=<vault 에서 가져온 토큰>
curl -i -X POST https://mcp.dgist.ac.kr/hwpx/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'
# 200, SSE event 응답
```

### 8-6. path strip 동작 원리

nginx `location /hwpx/` 의 `proxy_pass http://127.0.0.1:13701/;` (후행 슬래시) 는 **prefix `/hwpx` 를 제거하고 컨테이너로 전달**합니다. 따라서:

| 외부에서 호출 | 컨테이너가 받는 path |
|---|---|
| `https://mcp.dgist.ac.kr/hwpx/health` | `/health` |
| `https://mcp.dgist.ac.kr/hwpx/mcp` | `/mcp` (`MCP_PATH` 기본값) |

컨테이너 코드는 `/hwpx` prefix 를 모릅니다. 그 결과 `MCP_PATH` 환경변수도 그대로 `/mcp` 로 둘 수 있어 코드 수정 없이 N개 MCP 가 같은 nginx 뒤에서 운영됩니다.

---

## 9. Claude.ai · ChatGPT Custom Connector 등록

배포가 끝나면 사용자에게 토큰과 함께 다음 안내를 보냅니다.

> ⚠️ **UI 경로 주의**: Claude.ai · ChatGPT 모두 2025–2026 사이 Connector/Apps UI 가 여러 차례 개편되었습니다. 아래 경로는 v1.0 작성 시점(2026-05) 의 일반 사용자 기준이며, 실제 메뉴 명칭이 다를 수 있으니 운영자가 본인 계정으로 최신 화면을 확인 후 사용자 가이드에 캡처를 첨부해 배포하기를 권장합니다. URL·토큰 값은 동일합니다.

### 9-1. Claude.ai

1. https://claude.ai 로그인
2. **Customize → Connectors** (Team/Enterprise 는 **Organization settings → Connectors**)
3. **Add custom connector** (또는 **+ New Connector**) 선택
4. 입력:
   - Name: `DGIST hwpx-mcp` (자유)
   - URL: `https://mcp.dgist.ac.kr/hwpx/mcp`
   - Authentication: **Bearer Token** 선택 (UI 가 OAuth 만 강조하면 *Advanced* 또는 *Other* 메뉴에서 Bearer 선택)
   - Token: `<운영자가 발급한 MCP_TOKEN 값>`
5. Save → 새 대화창에서 *"한글 문서로 회의록 작성해줘"* 같이 호출

### 9-2. ChatGPT (Custom Apps — 2025-12 부터 명칭 변경, 구 "Custom Connectors")

1. https://chatgpt.com 로그인 — **Plus / Pro / Team / Enterprise** 플랜 필요
2. **Settings → Apps** (구 "Connectors")
3. **Add custom app** 선택. Plus/Pro 는 *Developer mode* 토글 필요할 수 있음.
4. 입력:
   - Name: `DGIST hwpx-mcp`
   - URL: `https://mcp.dgist.ac.kr/hwpx/mcp`
   - Auth: **Bearer Token** (UI 가 OAuth 위주이면 *Advanced* 또는 *Custom* 인증 옵션에서 Bearer 선택)
   - Token: `<발급 토큰>`
5. Save

### 9-3. 토큰 회전

사용자별 토큰을 사용 중이면 (`MCP_TOKENS=<csv>`):
1. `.env` 의 해당 토큰만 새 값으로 교체
2. `dcm restart hwpx-mcp`
3. 영향받은 사용자에게 새 토큰 보안 채널로 전달
4. 다른 사용자는 영향 없음 (동일 토큰 풀 안에서 자기 토큰만 변경)

전체 토큰 (`MCP_TOKEN` 단일) 사용 중이면 모든 사용자가 동시 회전 필요 — 사용자 분리 운영 권장.

---

## 10. CI/CD 파이프라인

> AI-HUB 가이드 §9 와 동일 패턴. hwpx-mcp 는 DB·MinIO 단계가 없어 더 단순.

### GitHub Actions — 서버 Git Pull 방식

`.github/workflows/deploy-mcp.yml` (예시):

```yaml
name: Deploy hwpx-mcp (Git Pull)

on:
  push:
    branches: [main]   # 또는 운영 브랜치
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            set -euo pipefail
            cd /app/mcp/hwpx

            # 1) working tree clean 가드 — modified·staged·untracked 모두 검사.
            #    운영 변경은 항상 PR/머지 통해서만, 서버 직접 수정 금지.
            if [ -n "$(git status --porcelain)" ]; then
              echo "ERROR: working tree dirty on deploy host. Investigate before deploy:"
              git status
              exit 1
            fi

            git fetch origin main

            # 2) FF only — non-FF (서버에서 임의 커밋이 생겼다는 뜻) 면 거부
            git merge --ff-only origin/main

            # 3) Force-push 가드 — fetch 후 HEAD 가 origin/main 과 동일해야 함
            #    (force-push 가 발생하면 merge --ff-only 가 silent OK 응답 후
            #    옛 커밋이 그대로 deploy 되는 사고 방지)
            HEAD_LOCAL=$(git rev-parse HEAD)
            HEAD_REMOTE=$(git rev-parse origin/main)
            if [ "$HEAD_LOCAL" != "$HEAD_REMOTE" ]; then
              echo "ERROR: HEAD ($HEAD_LOCAL) != origin/main ($HEAD_REMOTE) after FF merge."
              echo "       Likely a force-push to main. Aborting deploy."
              exit 1
            fi

            cd mcp-server
            docker compose --env-file .env up -d --build hwpx-mcp

            # Health check
            for i in $(seq 1 30); do
              if curl -sf http://127.0.0.1:13701/health | grep -q '"status":"ok"'; then
                echo "Health check passed"; exit 0
              fi
              sleep 2
            done
            echo "Health check failed"; exit 1
```

GitHub Secrets:
- `DEPLOY_HOST` — 배포 서버 IP/호스트명
- `DEPLOY_USER` — SSH 사용자명
- `DEPLOY_SSH_KEY` — SSH 프라이빗 키

> **주의**: 외부 GitHub Actions 가 사내 서버에 SSH 들어오는 모델입니다. 사내 정책상 외부 → 내부 inbound 가 막혔다면 self-hosted runner 또는 `docker pull` 기반 webhook 패턴으로 전환.

---

## 11. 운영 관리

### 11-1. 운영 반영 절차

#### A. 일반 코드 변경 (수동 deploy)

CI/CD (§10) 가 동작하지 않거나 hot-fix 가 필요할 때만 수동 적용. **운영 서버 working tree 는 항상 origin/main 의 fast-forward 로만 갱신** — `git pull` 의 기본 동작인 merge 는 금지(서버에서 임의 커밋이 생긴 사고를 가립니다).

```bash
cd /app/mcp/hwpx

# 1) working tree clean 가드 — modified·staged·untracked 모두 검사
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: dirty working tree on deploy host. Investigate before deploy:"
  git status
  exit 1
fi

# 2) 최신 커밋 받기
git fetch origin main

# 3) FF-only — 서버에 임의 커밋이 있으면(non-FF) 거부
git merge --ff-only origin/main

# 4) 빌드·재기동
cd mcp-server
dcm build --no-cache
dcm up -d
```

> ⚠️ **force-push 주의**: 누군가 `origin/main` 을 force-push 했다면 `merge --ff-only` 는 silent 하게 "Already up to date" 를 출력하고 옛 커밋이 그대로 배포 상태로 남을 수 있습니다. 운영 서버에서 deploy 후 항상 `git rev-parse HEAD` 와 GitHub 의 최신 commit hash 를 **수동 비교**하거나, deploy script 에 `git fetch && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]` 검증을 추가하세요. main 에 force-push 는 정책으로 금지하는 것이 정답.

#### B. 환경변수 변경

```bash
cd /app/mcp/hwpx/mcp-server
sudo vim .env

# 토큰·CORS 변경 → 재시작만
dcm up -d
```

### 11-2. 로그 확인

```bash
dcm logs -f hwpx-mcp                       # 실시간
dcm logs --tail=100 hwpx-mcp               # 최근 100줄
dcm logs --since="2026-05-02T09:00:00" hwpx-mcp
```

토큰 hash 로 누가 호출했는지 확인:

```bash
dcm logs hwpx-mcp | grep "token=" | awk -F'token=' '{print $2}' | sort | uniq -c | sort -rn
# 예:
#  142 [a3c7e1f9]
#   38 [b8d24a6c]
```

### 11-3. 백업

stateless 설계라 **보존할 데이터가 없습니다**. 백업 대상은 `.env` 만 — 평문 보관 금지, 반드시 GPG 또는 age 로 암호화하여 저장합니다 (§13 보안 체크리스트와 일치).

```bash
# /etc/cron.daily/hwpx-mcp-env-snapshot
# 사전 준비:
#   - 운영팀 GPG 공개키가 호스트에 임포트되어 있어야 함
#     gpg --import /path/to/itc-ops.asc
#     gpg --list-keys --keyid-format LONG | grep itc-ops
#   - 또는 age 사용: age-keygen -o /etc/age/itc-ops.key (privileged user)

set -euo pipefail
SRC=/app/mcp/hwpx/mcp-server/.env
DST=/data/mcp/hwpx/backup/env-$(date +%Y%m%d).env.gpg

umask 077
gpg --batch --yes \
    --recipient itc-ops@dgist.ac.kr \
    --output "$DST" \
    --encrypt "$SRC"
chmod 600 "$DST"

# 30일 retention
find /data/mcp/hwpx/backup -name 'env-*.env.gpg' -mtime +30 -delete
```

복원 시:
```bash
gpg --decrypt /data/mcp/hwpx/backup/env-20260502.env.gpg > /tmp/.env.restore
# 확인 후 /app/mcp/hwpx/mcp-server/.env 로 install -m 600
```

> **AI-HUB 와의 차이**: pg_dump·MinIO mc mirror·복구 SLA 같은 절차 불필요. 컨테이너 재기동만으로 깨끗한 상태로 복구됨. 백업 대상이 `.env` 1 개뿐이지만 그 안에 Bearer 토큰 평문이 있으므로 **암호화 보관이 필수**.

### 11-4. 롤백

```bash
cd /app/mcp/hwpx
git log --oneline -10
git checkout <이전 커밋>
cd mcp-server
dcm up -d --build
git checkout main      # 확인 후 복귀
```

### 11-5. 신규 외부 MCP 추가

부록 A 참조.

---

## 12. 트러블슈팅

### 12-1. `/health` 200 인데 Custom Connector 등록 시 *"Cannot reach server"*

원인 후보:
1. nginx server block 의 `location /hwpx/` 후행 슬래시 누락 → path strip 안 됨
2. `proxy_buffering off;` 누락 → SSE 응답이 nginx 버퍼에 갇힘

확인:
```bash
curl -i -X POST https://mcp.dgist.ac.kr/hwpx/mcp \
  -H 'Authorization: Bearer <token>' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'
```

응답이 `event: message\ndata: {...}` 형태(SSE) 면 정상. JSON 한 덩어리만 오면 nginx 버퍼링.

### 12-2. 401 만 계속 떨어짐

```bash
# .env 의 토큰 끝에 공백·줄바꿈이 들어갔는지 확인
od -c /app/mcp/hwpx/mcp-server/.env | grep MCP_TOKEN
# MCP_TOKEN=<hex>\n  ← \n 만 있어야 정상

# 토큰 비교 (vault 와 .env 가 동일한지)
sha256sum <(grep ^MCP_TOKEN /app/mcp/hwpx/mcp-server/.env | cut -d= -f2 | tr -d '\n')
```

### 12-3. Memory growing — `MCP_MAX_OPEN_DOCS_PER_OWNER` cap 도달

```bash
# 전체 호출 수
dcm logs --tail=5000 hwpx-mcp | grep "tools/call" | wc -l

# 토큰별 사용량
dcm logs --tail=5000 hwpx-mcp | grep "transport error" -B 1 | grep "token="
```

원인은 사용자가 `close_document` 안 부르고 새 문서 계속 업로드. 매일 03:00 자동 재기동(§7-4)이 회수해주지만, 자주 발생하면 사용자에게 "작업 끝나면 close 해주세요" 안내.

### 12-4. `Tool 'open_document' is disabled in HTTP mode` — 사용자 측 에러

원인: 사용자가 stdio 모드용 가이드 따라 `open_document` 호출. 정상 동작.

해결: 사용자에게 `upload_document_base64` 사용 안내 (Claude.ai/ChatGPT 가 알아서 base64 변환).

### 12-5. CORS preflight 실패

```bash
curl -i -X OPTIONS https://mcp.dgist.ac.kr/hwpx/mcp \
  -H 'Origin: https://claude.ai' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Authorization,Content-Type'
# 200 + Access-Control-Allow-Origin: https://claude.ai
```

`https://claude.ai` 가 응답 헤더에 안 보이면 `.env` 의 `MCP_ALLOWED_ORIGINS` 확인. ChatGPT 사용자라면 `https://chatgpt.com` 도 함께.

### 12-6. nginx 가 502 Bad Gateway 응답

```
2026/05/02 09:15:23 [error] connect() failed (111: Connection refused) while connecting to upstream
```

원인: nginx 가 살아있고 포트 13701 에 무언가 listen 안 하는 상태 (컨테이너 죽음 / 미기동).

확인:
```bash
ss -lntp | grep 13701           # 비어 있으면 컨테이너 다운
dcm ps                          # 상태 확인
dcm logs --tail=50 hwpx-mcp     # 죽은 원인 확인
```

해결: `dcm up -d hwpx-mcp` 로 재기동. 잦으면 §12-3 메모리 캡 도달인지 확인.

> **nginx 의 `host not found in upstream`** 메시지는 IP 리터럴(`127.0.0.1`) 에는 발생하지 않습니다 (DNS 조회가 필요한 호스트명을 upstream 에 적었을 때만). 본 가이드처럼 IP 만 사용하면 이 에러는 보이지 않습니다.

---

## 13. 보안 체크리스트

배포 전 다음 항목 확인:

### 환경변수
- [ ] `MCP_TOKEN` 신규 생성 (`openssl rand -hex 32`, 예시값 사용 금지)
- [ ] `.env` 파일 권한 `600`, owner root 또는 dgistai
- [ ] `.env` 가 git 에 안 들어가는지 (`.gitignore` 매치)
- [ ] vault 에 토큰 백업 + 사용자 ↔ 토큰 매핑 기록

### 네트워크
- [ ] 컨테이너 포트 `127.0.0.1:13701` 만 (외부 노출 X)
- [ ] HTTPS (TLS 1.2/1.3) 적용 — `mcp.dgist.ac.kr` 인증서 SAN 커버
- [ ] DNS A 레코드 `mcp.dgist.ac.kr` → 운영 서버 외부 IP
- [ ] 서버 방화벽 (UFW): 80, 443 만 외부 허용

### 인증·인가
- [ ] Bearer 토큰 길이 256bit 이상 (hex 64자)
- [ ] CORS allowlist 가 `*` 가 아닌 명시 origin
- [ ] nginx rate limit `mcp_per_ip` zone 정의 + 적용
- [ ] 멀티 테넌시 격리 동작 검증 (한 토큰의 doc_id 가 다른 토큰에 안 보이는지 — `/health` 외에 직접 테스트)

### 인프라
- [ ] Docker 이미지 root 가 아닌 사용자 (`uid 1001`)
- [ ] `read_only: true` + `tmpfs:/tmp` 적용
- [ ] `cap_drop: [ALL]` + `no-new-privileges`
- [ ] 매일 03:00 재기동 cron 활성
- [ ] UptimeRobot 알림 (또는 systemd timer 대체) 셋업

### 운영
- [ ] `.env` 일일 스냅샷 (30일 retention) 활성 — 스냅샷 자체도 600 권한 + GPG/age 암호화 (사내 정책에 따라)
- [ ] CI/CD SSH 키가 read-only 권한, 운영 서버 working tree clean 가드(§10 deploy script) 적용
- [ ] 컨테이너 로그 rotation (json-file `max-size: 10m, max-file: 5`)
- [ ] **nginx access/error 로그 retention** — 학내 표준 `logrotate` 14~30일 + 사내 SIEM 수집 (보안팀 표준)
- [ ] 사용자 가이드(토큰 + Custom Connector 등록 절차) 보안 채널로 발송 (메일·일반 채팅 X)

### 토큰·운영 정책
- [ ] **토큰 회전 주기 명문화** — 정기(분기 1회 권장) + 사고 발생 시 즉시. 사용자별 토큰(`MCP_TOKENS`) 운영이면 부분 회전 가능
- [ ] 토큰 ↔ 사용자 매핑 vault 에 보관 (서버 로그에는 SHA-256 prefix 8자만 남으므로)
- [ ] **인시던트 대응 런북** — 토큰 유출 의심 시 (1) 해당 토큰 `.env` 에서 즉시 제거 → `dcm restart` (2) 영향 사용자에게 새 토큰 재발급 (3) 최근 24h 호출 로그 보존·분석 (4) 보안팀 보고
- [ ] 분기 1회 침투 테스트 또는 의존성 audit (`npm audit` + Snyk 등)

---

## 부록 A — 신규 외부 MCP 추가 절차

새 MCP (예: `dgist-calendar-mcp`) 를 같은 서버·같은 도메인 위에 추가하는 절차:

### A-1. 컨테이너 추가

```bash
# 1) 디렉토리
sudo mkdir -p /app/mcp/calendar /data/mcp/calendar/logs
cd /app/mcp/calendar
git clone <repo-url> .

# 2) 환경변수
cd <subdir-with-compose>
cp .env.example .env
chmod 600 .env
sed -i "s|^MCP_TOKEN=.*|MCP_TOKEN=$(openssl rand -hex 32)|" .env
# 포트는 13701 와 다르게 — 예: 13702
sed -i "s|^MCP_PORT=.*|MCP_PORT=13702|" .env

# 3) docker-compose.yml 의 ports 라인을 13702 로 맞추고
dcm up -d --build
```

### A-2. nginx location 추가

`/etc/nginx/sites-available/dgist-ai` 의 `mcp.dgist.ac.kr` server block 안 `# === MCP 등록 영역 ===` 아래에:

```nginx
	    # ----- /calendar → calendar-mcp 컨테이너 (port 13702) -----
	    location /calendar/ {
	        proxy_pass         http://127.0.0.1:13702/;
	        proxy_http_version 1.1;
	        proxy_set_header   Host              $host;
	        proxy_set_header   X-Real-IP         $remote_addr;
	        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
	        proxy_set_header   X-Forwarded-Proto $scheme;
	        proxy_buffering    off;
	        proxy_cache        off;
	        proxy_read_timeout 600s;
	        proxy_send_timeout 600s;
	        proxy_set_header X-User-Id        "";
	        proxy_set_header X-User-Login-Id  "";
	        proxy_set_header X-User-Name      "";
	        proxy_set_header X-User-Role      "";
	        proxy_set_header X-Auth-Source    "";
	    }
```

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -I https://mcp.dgist.ac.kr/calendar/health    # 200 OK
```

### A-3. 사용자 안내

Custom Connector URL = `https://mcp.dgist.ac.kr/calendar/mcp`. 토큰은 신규 발급분.

### A-4. 운영 일관성 체크리스트

신규 MCP 가 본 가이드의 §1-1 패턴을 따르는지 확인:

- [ ] 컨테이너 loopback only (`127.0.0.1:1370x`)
- [ ] Bearer 인증 + CORS allowlist
- [ ] `read_only: true` + `cap_drop ALL`
- [ ] `/health` 엔드포인트 노출
- [ ] SSE 호환 (HTTP streaming 응답)
- [ ] 멀티 테넌시 격리 (토큰별 데이터 분리)
- [ ] `.env` 파일 권한 600

이 항목 중 충족 못 하는 것은 운영 표준 위반 — 추가 전에 코드 수정.

---

## 부록 B — 내부 전용 MCP 와의 차이

본 가이드는 **외부 공개 MCP 만** 다룹니다. 사내 업무 시스템(학사·인사·재무 등) 연계 MCP 는 별도 인프라·도메인·코드 저장소에서 운영합니다. 핵심 원칙: **물리/논리 호스트 분리가 정답**, 같은 호스트 공유는 §1-3 의 임시 예외 절차 외에는 금지.

| 레이어 | 외부 (본 가이드) | 내부 전용 (별도 트랙) |
|---|---|---|
| 호스트 | 외부 노출 가능 호스트 (DMZ 또는 학내 공개 영역) | **별도 물리/가상 호스트** (사내망 only) |
| 도메인 | `mcp.dgist.ac.kr` | `mcp-internal.dgist.ac.kr` |
| 서버 | 외부 노출 가능 호스트 | DMZ 내부 호스트 |
| DNS | 공인 DNS A 레코드 | 사내 DNS 또는 split-horizon (외부 resolve 불가) |
| 인증서 | 공인 CA | 사내 CA |
| 방화벽 | 80/443 외부 허용 | 학내 대역(`10.0.0.0/8` 등) + VPN pool 만 |
| nginx listen | `0.0.0.0:443` | 외부 NIC 에 listen 자체 안 함 |
| nginx allow/deny | 제한 없음 (Bearer + rate limit 만) | `allow 10.110.0.0/16; deny all;` |
| Bearer 토큰 | 사용자별 발급, 관리자 회전 | MFA/SSO 연동 (ai-auth 위에서 발급) |
| 코드 저장소 | 공개 GitHub | 사내 GitHub Enterprise / GitLab |
| Custom Connector | Claude.ai · ChatGPT 등록 가능 | 외부 AI 등록 불가 (도메인 비공개) |
| 감사 로그 | 토큰 hash + 호출 로그 (json-file 5×10MB) | **모든 요청 풀 로그 + 5년 보존** |

내부 MCP 가이드는 별도 문서로 작성. 본 가이드의 외부 패턴을 출발점으로 하되, 도메인·인증서·방화벽·로그 정책은 위 표 따라 강화.

---

## 부록 C — AI-HUB 와의 차이

| 항목 | AI-HUB | hwpx-mcp |
|---|---|---|
| 데이터 영속화 | PostgreSQL + MinIO (영속) | **메모리만** (재기동 시 모두 소멸 — 의도된 stateless) |
| Migration | 수동 SQL (Drizzle 마이그레이션) | 없음 |
| Auth | Auth.js v5 + Email OTP (Resend) | Bearer 토큰 |
| 사용자 식별 | DB 의 user 테이블 | 토큰 hash (`docOwners` Map) |
| 백업 SLA | DB pg_dump + MinIO mirror, 30분 복구 | `.env` 스냅샷만 |
| Health check | db/minio/anthropic/resend probe | `/health` 200 단일 |
| Docker 이미지 크기 | ~200 MB | ~150 MB |
| 운영 디렉토리 | `/app/ai-hub` + `/data/ai-hub/{postgres,minio,logs,backup}` | `/app/mcp/hwpx` + `/data/mcp/hwpx/logs` |
| nginx server block | `ai-hub.dgist.ac.kr` 단독 | `mcp.dgist.ac.kr` 안의 `/hwpx` location (게이트웨이 패턴) |
| 패키지 매니저 | pnpm | npm |

**공통 패턴** (학내 표준):
- `/app/<svc>` + `/data/<svc>/*` 분리
- nginx 단일 파일 (`/etc/nginx/sites-available/dgist-ai`) 에 server block 누적
- `.env` 권한 `600` + git 제외
- UptimeRobot + systemd timer 백업
- 보안 헤더 (HSTS, X-Frame-Options, Referrer-Policy 등)
- 클라이언트 spoofing 차단 (X-User-* 강제 빈 값)

---

**문의**: `itc@dgist.ac.kr` (정보전산팀)
**저장소**: https://github.com/flamingo8006/hwpx-mcp
**관련 문서**: [[DGIST AI-HUB - 운영 배포 가이드]] · [[Nginx 설정 샘플]]
