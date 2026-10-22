# SVG Drawing — 2026-10-22 인계

## 현황

**운영 검증은 진행했지만 UI 구현·새 배포는 소스 부재로 보류했다.** 이 브랜치는 운영 소스가 아니다. 기본 브랜치를 그대로 배포하면 운영 기능이 회귀한다.

- 저장소: `nijoow/svg-drawing`, 인계 브랜치: `codex/editor-ux-20261022`.
- 접근 가능한 기준: `origin/master`의 `1fa79f53bc21931aed389ad0e8a769c10c8def3b`.
- 운영: https://nijoow-drawing.vercel.app — `7b2e36448a5b8b8969030ccd04a5de9fb3246a76`, 배포 `dpl_54BeuMxmC8r742H12krnvavDPneP`, `READY`.
- 기존 Vercel 프로젝트: `prj_FkdAAmdxbXBs6Y5IliEi5wN3ONDE`; 팀: `team_yGuTMABe9I2plwyJAyRujgrJ`. 기존 프로젝트·도메인·설정 변경 없음.
- 운영은 이전 클라우드 작업 `01a12549-614b-74e2-af17-fa43160bf013`에서 정적 빌드 결과를 업로드했다. 해당 기록에 Git 미푸시가 명시돼 있다. Vercel 파일 목록은 HTML/JS/CSS 빌드 결과이며 TSX·테스트 소스가 아니다.
- 맥북 원본은 `master`의 `8c5e181`과 미추적 파일 11개를 그대로 보존했다. 별도 복제본에서 작업했다. 저장소 안에 `AGENTS.md` 또는 `.agents/skills`는 발견되지 않았다. 다음 클라우드 환경의 지침은 별도로 확인할 것.

## 변경

앱 코드 변경, 운영 배포, 프로젝트 권한 변경 없음. 이 문서와 실제 운영에서 내려받은 검증 자료만 추가했다. 문서 브랜치 푸시로 Git 연동 미리보기 빌드가 자동 시작되므로, 과거 소스를 담은 해당 빌드는 중지 대상으로 처리한다. 운영 커밋과 혼동하지 말 것.

| 검사 | 실제 결과 |
| --- | --- |
| 그리기·선택 | Shapes → Rectangle 드래그로 220×150 생성, Select 자동 전환, 선택 핸들 확인 |
| 이동 | 캔버스 드래그 후 X/Y 300/250 → 355/300 |
| 회전·크기 | 속성 패널에서 회전 30°, 너비 280 적용. 핸들 드래그 회전·리사이즈는 미검증 |
| Undo/Redo | 너비 280 → 220 → 280, 회전 30° 유지. Undo 후 선택이 풀려 재선택해야 속성이 보임 |
| 프로젝트 저장 | 버전 2 JSON 다운로드, 도형 치수·좌표·회전 보존 확인 |
| 자동 복원 | 새로고침 후 도형 1개 복원, 너비 280·높이 150·회전 30° 확인. 편집 이력·선택은 복원되지 않음 |
| 프로젝트 파일 열기 | 파일 선택 단계까지 진행했으나 Chrome 확장 파일 URL 접근 제한으로 실제 불러오기 미실행. 권한 확대하지 않음 |
| SVG 내보내기 | XML 파싱 가능, SVG namespace·viewBox·도형 path 확인. 회전된 도형 경계가 출력에 포함됨 |
| 작은 화면 | Chrome 390×844 뷰포트 검사. 레이어 패널이 작업 영역을 많이 가림. 검사 후 뷰포트 원복 |
| 빌드·단위 테스트 | 운영 소스와 테스트를 확보하지 못해 이번 작업에서는 미실행 |
| 실제 기기 | 맥북 Chrome 마우스/키보드 검사. 모바일 터치·Safari·스크린리더 실기기 미검증 |

검증 파일: [프로젝트 JSON](evidence/2026-10-22/rectangle.svg-drawing.json), [출력 SVG](evidence/2026-10-22/rectangle.svg). 모두 이번 검사에서 만든 단일 사각형이며 사용자 기존 문서가 아니다.

검증 화면: [데스크톱](evidence/2026-10-22/desktop.jpg), [390px](evidence/2026-10-22/mobile-390.jpg). 화면은 파일 불러오기 검사를 위해 너비를 추가로 310으로 변경한 상태다. 파일 불러오기가 실행되지 않아 280으로 복원되지 않았으며, 이는 불러오기 기능 실패를 입증하는 결과가 아니라 브라우저 권한 차단이다.

## 다음 일

1. **기존 저장 클라우드 환경에서 원본을 먼저 복구한다.** 기존 작업의 `/workspace/svg-drawing`과 `/workspace/scratch/svg-vercel-deploy-7b2e364`를 확인한다. 맥북/GitHub에 해당 커밋은 없으며 `git fetch origin 7b2e36448a5b8b8969030ccd04a5de9fb3246a76`은 `not our ref`로 실패했다. 이전 작업의 초대형 턴은 기록 읽기 크기 제한으로 전체 패치를 가져올 수 없었다. 원본이 없으면 전체 소스·테스트가 담긴 bundle/archive가 필요하다.

   ```sh
   # 기존 클라우드 원본에서 실행. 원본 확인 전 reset/checkout 하지 말 것.
   git status --short
   git cat-file -t 7b2e36448a5b8b8969030ccd04a5de9fb3246a76
   git log -5 --oneline
   git bundle create svg-drawing-recovery.bundle --all
   # bundle은 커밋만 포함한다. 수정/미추적 파일은 별도로 검토·보존한다.
   git diff --binary > svg-drawing-working.patch
   git diff --cached --binary > svg-drawing-index.patch
   ```

2. 복구한 소스의 실제 `package.json`, 잠금 파일, 지침에 맞춰 의존성을 설치한다. 기존 코드에는 Yarn 3.6.0 설정이 있다. 아래 명령은 복구한 스크립트 확인 후 사용한다. **이번 작업에서 통과했다고 주장하지 않는다.**

   ```sh
   node .yarn/releases/yarn-3.6.0.cjs install --immutable
   node .yarn/releases/yarn-3.6.0.cjs exec tsc --noEmit
   node .yarn/releases/yarn-3.6.0.cjs lint
   node .yarn/releases/yarn-3.6.0.cjs test
   node .yarn/releases/yarn-3.6.0.cjs build
   node .yarn/releases/yarn-3.6.0.cjs dev -p 4313
   ```

3. 다음 핵심 UI 개선을 구현한다. 추가 도구 확장보다 편집 흐름을 우선한다.
   - 도구: 현재 도구명/단축키를 항상 식별할 수 있게 하고 주요 도형을 쉽게 발견하도록 배치한다.
   - 선택: Undo/Redo 뒤 가능한 선택을 유지하고 변경 피드백을 알린다. 사각형을 `polygon`으로만 표시하는 이름도 다듬는다.
   - 속성: 위치·크기·회전·색상을 한 패널에 모은다. 현재 색상은 좌상단, 기하 속성은 우측으로 분산돼 있다. Clipping mask·Blend는 보조 섹션으로 접는다.
   - 작은 화면: 시작 시 패널을 닫고 명시적으로 열게 한다. 패널은 하단 시트로 제공하며 캔버스를 덮는 면적을 제한한다. 도구/뷰/선택 컨트롤의 여러 줄 고정 배치를 정리한다.
   - 접근성: 중복된 `Layers panel`/`Properties panel` 영역과 중복 제목을 정리한다. 선택 상태를 색상 외 표시로 전달하고 키보드 포커스·툴팁·저장/실패 live 안내를 검증한다. 실제 대비 수치는 아직 측정하지 않았다.
4. JSON 왕복·손상 파일 처리·SVG 출력·포인터 변형·키보드 편집·390px 흐름을 검증한다. 기존 소스에 보고된 테스트를 실제 실행한 뒤 커밋·푸시한다. 새 PR은 필요 시 draft로 만든다.
5. 정확한 복구 커밋으로 기존 Vercel 경로에서 배포하고 READY 및 운영 동작까지 확인한다. 복구 지점은 위 운영 배포다. 계정·결제·공개 범위·권한은 확대하지 않는다.
