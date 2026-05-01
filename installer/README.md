# hwpx-mcp 설치 패키지

Claude Desktop 에서 한글(HWPX) 문서를 자동 작성할 수 있도록 MCP 서버·스킬·공문서 서식 템플릿을 한 번에 설치합니다.

## 설치되는 것

| 항목 | 위치 (Windows) | 위치 (macOS) |
|------|----------------|---------------|
| Claude Desktop MCP 등록 | `claude_desktop_config.json` 의 `mcpServers.hwpx` | 동일 (`~/Library/Application Support/Claude/`) |
| 한글 작성 스킬 | `%USERPROFILE%\.claude\skills\hwpx-document-writer\` | `~/.claude/skills/hwpx-document-writer/` |
| 공문서 서식 템플릿 | `%USERPROFILE%\Documents\skills\templates\공문서_프레임.hwpx` | `~/Documents/skills/templates/공문서_프레임.hwpx` |

기존에 설치되어 있는 경우에도 안전합니다. 본 인스톨러가 손대는 경로는 다음 다섯 가지뿐이며, 그 외에는 어떤 사용자 파일도 만들거나 지우지 않습니다:

1. `claude_desktop_config.json` 의 **`mcpServers.hwpx` 키 1개** — 다른 MCP 항목의 **값(키·명령·인자)은 그대로 유지**합니다. 단, 파일 전체는 표준 포맷(`indent=2`, 끝 줄바꿈)으로 다시 직렬화되므로 들여쓰기·공백·키 순서·줄바꿈 스타일(CRLF→LF 등) 같은 미세한 포맷팅 차이는 발생할 수 있습니다 (값은 동일, 바이트는 동일하지 않음). 변경 직전 원본은 자동으로 `.bak-{시각}` 에 보관됩니다.
2. `~/.claude/skills/hwpx-document-writer/` **폴더만** — 같은 디렉토리의 다른 스킬·파일은 절대 건드리지 않음 (옛 v0.5.2 인스톨러가 남긴 잔재 `SKILL.md`/`REFERENCE.md` 가 보이면 **경고만** 띄우고 손은 안 댐).
3. `~/Documents/skills/templates/<템플릿>.hwpx` **파일 1개만** — 같은 폴더의 다른 템플릿은 보존.
4. **위 항목들의 백업 형제 파일** `.bak-{날짜시각}` — 우리가 만들고, 최근 2개만 자동 유지(이전 백업은 prune).
5. **임시 파일/디렉토리 (실행 중에만 존재, 종료 시 자동 정리)**:
   - 시스템 temp 영역(`$TMPDIR` / `%TEMP%`)에 스킬 zip 추출용 임시 폴더(`hwpx-skill-*`).
   - **macOS 전용** — config 디렉토리에 atomic-write 용 `.claude_desktop_config.*.tmp` 형제 파일(`os.replace` 후 즉시 사라짐, 실패 시 except 블록에서 unlink). Windows 인스톨러는 atomic-write 임시 파일을 만들지 않고 `ConvertTo-Json` 결과를 직접 덮어씁니다(원본은 4번의 `.bak-` 으로 보존).

---

## 사전 요구사항

1. **[Node.js 18 LTS](https://nodejs.org/) 이상** 설치 — 터미널/PowerShell 에서 `node --version` 이 떠야 합니다.
2. **[Claude Desktop](https://claude.ai/download)** 설치 — 설치 직후 **최소 한 번은 실행** 해서 설정 파일이 생성되게 해주세요.

> ⚠️ **설치 전 Claude Desktop 을 완전히 종료** 해주세요. 실행 중이면 Claude Desktop 이 옛 설정을 메모리에 유지해, 디스크에 새 설정이 써져도 *"hwpx-mcp 도구가 연결되어 있지 않습니다"* 가 뜹니다.
> - **Windows**: 시스템 트레이(화면 우하단) Claude 아이콘 우클릭 → **Quit**.
> - **macOS**: Cmd+Q, 또는 메뉴 막대의 Claude 아이콘 → **Quit**.
> - 인스톨러가 실행 중인 Claude 를 감지하면 경고하고 진행 여부를 묻습니다.

---

## Windows 설치 (추천)

1. 배포받은 `hwpx-mcp-installer-windows.zip` 을 다운로드 받은 폴더에서 **압축 해제** 합니다.
2. 압축 푼 폴더 안의 **`install-windows.bat`** 파일을 **더블클릭** 합니다.
3. Windows SmartScreen 경고가 뜨면 **「추가 정보」 → 「실행」** 을 눌러 진행합니다.
4. PowerShell 창에 설치 계획이 표시되고, 자동으로 설정이 완료됩니다.
5. 설치가 끝나면 **Claude Desktop 을 완전히 종료한 뒤 다시 실행** 합니다.
   - 시스템 트레이(화면 우하단) 아이콘을 우클릭 → **Quit**.
   - 일반 창 닫기(X)만 하면 백그라운드에 남아 설정이 안 반영됩니다.

### 표준 사용자 계정 (관리자 권한 없는 PC)

Microsoft Store 버전 Claude Desktop 이 설치된 경우에도 설치 스크립트가 자동으로 경로를 찾아갑니다:
- 일반(EXE installer): `%APPDATA%\Claude\claude_desktop_config.json`
- Store 앱: `%LOCALAPPDATA%\Packages\Claude_{publisherHash}\LocalCache\Roaming\Claude\claude_desktop_config.json`

수동으로 경로를 지정하고 싶으면 PowerShell 에서:
```powershell
$env:HWPX_MCP_CLAUDE_CONFIG = "C:\전체\경로\claude_desktop_config.json"
.\install-windows.ps1
```

---

## macOS 설치 (추천)

1. 배포받은 `hwpx-mcp-installer-macos.zip` 을 다운로드 받은 폴더에서 **압축 해제** 합니다.
2. 압축 푼 폴더 안의 **`install-macos.command`** 파일을 **더블클릭** 합니다.
3. 첫 실행 시 *"확인되지 않은 개발자"* 경고가 뜨면:
   - **Finder 에서 파일을 우클릭(또는 Control+클릭) → "열기"** 선택 → 다시 "열기"
   - 또는 **시스템 설정 → 개인정보 보호 및 보안** 화면 하단의 *"확인 없이 열기"* 클릭.
   - 또는 터미널에서 `xattr -dr com.apple.quarantine .` 실행 후 더블클릭.
4. Terminal 창에 설치 계획이 표시되고, 자동으로 설정이 완료됩니다.
5. 설치가 끝나면 **Claude Desktop 을 완전히 종료한 뒤 다시 실행** 합니다 (Cmd+Q, 또는 메뉴 막대 → Quit).

### 터미널에서 직접 실행

`.command` 더블클릭 대신 터미널을 직접 쓰는 것이 편하다면:
```bash
cd ~/Downloads/hwpx-mcp-installer-macos
bash install-macos.sh
```

수동으로 config 경로를 지정하고 싶으면 환경변수를 사용:
```bash
HWPX_MCP_CLAUDE_CONFIG="/path/to/claude_desktop_config.json" \
  bash install-macos.sh
```

### 수동 설치 (스크립트 없이)

자동 인스톨러를 쓰지 않고 직접 설정하려면:

1. **MCP 등록** — `~/Library/Application Support/Claude/claude_desktop_config.json` 의 `mcpServers` 객체 안에 다음 키 추가:
   ```json
   "hwpx": {
     "command": "npx",
     "args": ["-y", "hwpx-mcp-server@latest"]
   }
   ```
2. **스킬 설치** — 페이로드 zip 이 평면 구조(SKILL.md 가 zip 루트)일 수도 있으므로 반드시 **하위 폴더에 풀어** 잘못된 레이아웃을 방지:
   ```bash
   mkdir -p ~/.claude/skills/hwpx-document-writer
   unzip -o payload/hwpx-document-writer.zip -d ~/.claude/skills/hwpx-document-writer/
   # 만약 zip 안에 hwpx-document-writer/SKILL.md 처럼 폴더가 한 단계 더 있다면 한 칸 끌어올림:
   if [ -d ~/.claude/skills/hwpx-document-writer/hwpx-document-writer ]; then
     mv ~/.claude/skills/hwpx-document-writer/hwpx-document-writer/* \
        ~/.claude/skills/hwpx-document-writer/
     rmdir ~/.claude/skills/hwpx-document-writer/hwpx-document-writer
   fi
   ```
3. **템플릿 복사**:
   ```bash
   mkdir -p ~/Documents/skills/templates
   cp payload/공문서_프레임.hwpx ~/Documents/skills/templates/
   ```
4. **Claude Desktop 재시작** (Cmd+Q → 재실행).

---

## 설치 확인

Claude Desktop 의 새 대화에서 아래 프롬프트로 테스트:

```
공문서 서식으로 '설치 테스트' 라는 간단한 문서 하나 만들어줘
```

정상 동작하면 `~/Downloads/` (macOS) / `%USERPROFILE%\Downloads\` (Windows) 에 `.hwpx` 파일이 생성됩니다.

---

## 샘플 프롬프트

| 원하는 작업 | 예시 프롬프트 |
|-------------|--------------|
| 공문서 서식으로 보고서 | "공문서 서식으로 2026년 생성형 AI 교육 계획 작성해줘" |
| 일반 한글 문서 (자유 양식) | "한글 문서로 회의록 작성해줘 (일시·참석자·안건·결정사항 포함)" |
| 기존 hwpx 파일 수정 | "~/Downloads/보고서.hwpx 열어서 제목을 'v2' 로 바꿔줘" |

---

## 제거

**Windows**: 설치 폴더의 `uninstall-windows.bat` 더블클릭.

**macOS**: 설치 폴더의 `uninstall-macos.command` 더블클릭 (또는 터미널에서 `bash uninstall-macos.sh`).

두 경우 모두 다음과 같이 동작합니다:
- `mcpServers.hwpx` 항목만 config 에서 제거 (다른 MCP 보존, config 백업 자동 생성)
- 스킬 폴더는 `.bak-{timestamp}` 로 이동 (삭제 아님 — 복구 가능)
- 템플릿 파일은 **삭제하지 않음** (사용자가 편집했을 수 있음). 완전히 지우려면:
  ```bash
  rm ~/Documents/skills/templates/공문서_프레임.hwpx          # macOS
  del "%USERPROFILE%\Documents\skills\templates\공문서_프레임.hwpx"  # Windows
  ```

Claude Desktop 재시작하면 hwpx 연동이 제거됩니다.

---

## 문제 해결

### "Node.js not found"
→ https://nodejs.org/ 에서 **LTS 버전** 설치 후 재시도. 설치 후 터미널/PowerShell 을 완전히 새로 열어야 PATH 가 반영됩니다.

### "Claude Desktop config directory not found"
→ Claude Desktop 설치 후 **한 번도 실행하지 않은 상태**. Claude Desktop 을 열어 로그인까지 완료한 뒤 재시도.

비표준 경로에 설치된 경우 환경변수로 강제 지정:
```powershell
# Windows
$env:HWPX_MCP_CLAUDE_CONFIG = "C:\Users\내계정\AppData\Roaming\Claude\claude_desktop_config.json"
.\install-windows.ps1
```
```bash
# macOS
HWPX_MCP_CLAUDE_CONFIG="/Users/내계정/Library/Application Support/Claude/claude_desktop_config.json" \
  bash install-macos.sh
```

### "Multiple Claude config files detected"
→ EXE installer 버전과 Store 버전이 같이 설치된 경우. 메시지에 나온 경로 중 **실제로 쓰는 것** 을 환경변수로 지정한 뒤 재설치.

### 설치 후에도 "한글 MCP 도구가 없다" 고 나옴
99% 의 경우 **설치 시점에 Claude Desktop 이 실행 중이었던 것** 이 원인입니다. Claude Desktop 은 시작 시 한 번만 config 를 읽고 메모리에 유지하므로, 디스크에 새 항목이 써져도 다음 *완전 재시작* 까지 반영되지 않습니다.

해결:
1. Claude Desktop 을 **완전히 종료** 합니다.
   - **Windows**: 시스템 트레이 아이콘 우클릭 → **Quit**. 창 닫기(X) 만 하면 백그라운드에 남습니다.
   - **macOS**: Cmd+Q, 또는 메뉴 막대 Claude 아이콘 → **Quit**. 창 닫기(빨간 점) 만 하면 백그라운드에 남습니다.
2. 인스톨러를 **다시 실행** 합니다 (이미 설정이 동일하면 자동으로 skip 되며 안전).
3. Claude Desktop 을 다시 엽니다.

> ℹ️ 인스톨러 v0.5.3+ 는 시작 시 실행 중인 Claude 를 감지하고 경고합니다. 위 절차는 그 경고를 놓쳤거나 옛 인스톨러로 설치한 경우의 복구 가이드입니다.

### macOS — *"확인되지 않은 개발자"* / *"Apple cannot check..."* 경고
→ Gatekeeper 격리 속성 때문입니다. 다음 중 하나로 해결:
1. Finder 에서 `install-macos.command` 우클릭(또는 Control+클릭) → **열기** → 다시 **열기** 클릭.
2. **시스템 설정 → 개인정보 보호 및 보안** 하단의 *"확인 없이 열기"* 버튼 클릭.
3. 터미널에서 `xattr -dr com.apple.quarantine /path/to/hwpx-mcp-installer-macos` 실행 후 더블클릭.

### 템플릿이 깨졌다 / 잘못 설치됐다
→ 같은 installer 를 다시 실행하세요. 기존 파일은 `.bak-{timestamp}` 로 백업된 후 교체됩니다.

### 완전히 롤백하고 싶다
1. `uninstall-windows.bat` (Windows) / `uninstall-macos.command` (macOS) 실행.
2. `claude_desktop_config.json.bak-{timestamp}` 중 설치 **이전** 타임스탬프 파일을 원래 이름으로 복원.
3. `hwpx-document-writer.bak-{timestamp}` 폴더도 마찬가지로 복원.
4. Claude Desktop 재시작.

---

## 관련 링크

- npm 패키지: <https://www.npmjs.com/package/hwpx-mcp-server>
- GitHub: <https://github.com/flamingo8006/hwpx-mcp>
- 이슈/문의: GitHub Issues

---

## 라이선스 / 배포

DGIST 정보전산팀 테스터 배포판. 라이선스는 저장소 루트의 `LICENSE` 파일을 따릅니다.
