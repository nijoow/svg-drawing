# SVG Drawing — 2026-10-22 편집 UX 인계

## 소스와 구현

- 운영 복구 기준: `recovery/production-20261022`의 `faeab8c8709fc523357912ac8e99ed26d71ac2d4`.
- 개발 브랜치: `codex/editor-ux-followup-20261022`; 구현 커밋: `6d6bcfd236c1b5d7558a8b083112921f416db6d1`.
- 오래된 master는 배포하지 않았다. 사용자 파일과 복구 산출물을 보존했다. 이 환경에서는 저장소/상위 `AGENTS.md`, `.agents/skills` 파일이 발견되지 않았다. Space 수정 없음.
- Undo/Redo/취소 후 복원 문서에 존재하는 편집 가능한 선택을 유지한다. 새 문서/파일 교체는 선택을 초기화한다. 삭제된 객체의 선택을 다시 만들어 내지는 않는다.
- 위치·크기·회전·불투명도·채우기·선 색상/두께를 Properties에 모았다. 선택 중에는 기존 상단 색상 바를 숨긴다. 다중 선택의 모양 변경은 전체 선택에 적용한다. Blend/마스크는 Advanced appearance로 접었다.
- 1100px 이하 패널은 기본 닫힘을 유지하며, 열면 최대 42dvh/360px 하단 시트가 된다. Fit은 시트 높이를 반영한다. 현재 도구/단축키, Edit object 진입점, 바로 그리는 사각형 버튼, 활성 버튼 밑줄을 추가했다. 새 도형에 Rectangle/Triangle/Ellipse 이름을 부여한다.
- 패널 영역 이름/중복 제목을 정리하고 select/summary 포커스를 보강했다. 이미지 입력에서 기존 SVG 처리 경로도 선택할 수 있게 했다.
- 기존 복구 브랜치와 이번 개발 브랜치의 Git 자동 빌드는 꺼져 있다. 운영은 기존 정적 업로드 경로를 사용한다.

## 실제 테스트

- Node 18.20.8, 저장소 Yarn 3.6.0. 기본 환경 Node는 복구 PnP와 호환되지 않았다. `YARN_GLOBAL_FOLDER=/tmp/svg-yarn-global`로 홈 폴더 쓰기 없이 설치했다.
- `yarn install --immutable`, `yarn test`: **96/96 통과**. 선택 유지/존재하지 않는 ID 필터링/문서 교체에 대한 실제 dispatcher 회귀 검사 2개 추가.
- `yarn typecheck`, `yarn lint`: 통과. 최종 정적 빌드에서도 타입/린트 검사 통과.
- 별도 `/tmp/svg-ux-build` 사본의 `next.config.js`에만 `output: 'export'`, `experimental: { cpus: 2 }` 적용. `yarn build` 통과. 루트 앱 설정과 서버 기능은 변경하지 않았다. 산출물 소스 `src/`가 구현 커밋 작업 사본과 일치하는지 확인했다.
- `scripts/verify-editor-ux.cjs`: 개발 서버와 최종 정적 산출물에서 각각 통과. Playwright Chromium, 1440×1000 / 390×844. 브라우저 오류 0개.
- 그리기/선택 → 회전 30°/너비 280 → Undo 220/Redo 280와 선택 유지 → 선 두께/채우기 → 마우스 드래그/키보드 이동 → 프로젝트 다운로드 → 너비 310 변경 → 실제 file input으로 프로젝트 열어 280 복원 → 손상 JSON 오류/현재 문서 보존 → 새로고침 자동복원 → 390px 패널 기본 닫힘/높이 제한/수치 편집 Undo를 확인했다.
- 내보낸 SVG는 Python XML 파서로 namespace/viewBox/path를 확인했다. 파일 불러오기는 Playwright `setInputFiles`로 앱의 실제 File 객체/파싱 경로를 실행했다. OS 파일 선택창을 수동 조작한 것은 아니다.
- 증거: [정적 검증 결과](evidence/2026-10-22-ux/result.json), [데스크톱](evidence/2026-10-22-ux/desktop.png), [390px](evidence/2026-10-22-ux/mobile-390.png), [프로젝트](evidence/2026-10-22-ux/Untitled.svg-drawing.json), [SVG](evidence/2026-10-22-ux/Untitled.svg).

재실행(호스트에 Playwright/Chromium 필요, 앱 의존성 추가 없음):

```sh
export PATH=/workspace/.tools/node-v18.20.8/bin:$PATH
export YARN_GLOBAL_FOLDER=/tmp/svg-yarn-global
node .yarn/releases/yarn-3.6.0.cjs test
node .yarn/releases/yarn-3.6.0.cjs typecheck
node .yarn/releases/yarn-3.6.0.cjs lint
BASE_URL=http://localhost:4314 node scripts/verify-editor-ux.cjs
```

## 배포

- 운영: https://nijoow-drawing.vercel.app
- 배포 ID: `dpl_KphCvkjF1prxcdG7hhmDMwaE6Cgf`, 상태 **READY**, target **production**, aliasError 없음. 빌드 시간 약 1.6초(로컬에서 이미 빌드한 정적 파일 업로드).
- 배포 URL: https://nijoow-drawing-yd9pe6594-nijoows-projects.vercel.app
- 팀 `team_yGuTMABe9I2plwyJAyRujgrJ`, 기존 프로젝트 `prj_FkdAAmdxbXBs6Y5IliEi5wN3ONDE`. 메타데이터 구현 커밋 `6d6bcfd` 확인. 운영 별칭으로 다시 조회해 새 배포 ID와 커밋을 확인했다.
- 기존과 같은 정적 업로드: 검증한 `out/` 파일 25개(1,282,488바이트)와 정적 호스팅 vercel.json. `framework:null`, build/install 빈 문자열, outputDirectory `.`는 해당 배포의 정적 빌드 재실행 방지 설정이다. 프로젝트의 계정/권한/요금제/Node24 설정은 변경하지 않았다.
- Vercel 파일 목록에서 배포된 `index.html`, `index.txt`, `404.html`, favicon의 SHA-1이 로컬 빌드와 일치했다. page JS/CSS도 해당 SHA로 배포 파일 API 조회 성공. 파일 API의 긴 본문/깊은 목록은 도구에서 잘리므로 전체 원격 바이트 재해시 검증을 했다고 주장하지 않는다.
- **운영 브라우저 검증 차단**: curl은 `CONNECT tunnel failed, response 403`(HTTP 000), Playwright는 `page.goto: net::ERR_TUNNEL_CONNECTION_FAILED`로 페이지 로드 전에 실패했다. 공개 웹 조회 도구도 URL 접근 불가였다. 이는 앱 로드 이후 오류로 확인된 것이 아니다. 권한/보호/네트워크 설정을 확대하지 않았다. 따라서 운영 편집 동작은 **미검증**이며, 앞의 브라우저 통과는 정확한 배포 산출물을 로컬 정적 서버로 제공한 결과다.
- 새 배포의 최근 10분 error/fatal runtime 로그 조회: 해당 로그 없음. 서버 함수 없는 정적 앱이므로 이 결과로 운영 클라이언트 오류가 없다고 판정하지 않는다.
- 롤백 기준: 직전 운영 배포 `dpl_54BeuMxmC8r742H12krnvavDPneP`/소스 `7b2e364`와 recovery/production 스냅샷을 보존했다. 롤백하지 않았으며 필요 시 기존 배포를 재지정할 수 있다.
- [Draft PR #7](https://github.com/nijoow/svg-drawing/pull/7), base는 recovery 브랜치다. merge하지 않았다. [빌드 파일 체크섬](evidence/2026-10-22-ux/build-manifest.json).
- 후속 확인: 네트워크 접속 가능한 환경에서 아래 스크립트를 운영 URL로 실행하고 결과를 추가한다. 실기기 검증은 별도로 진행한다.

```sh
BASE_URL=https://nijoow-drawing.vercel.app EVIDENCE_DIR=/tmp/svg-production-evidence node scripts/verify-editor-ux.cjs
```

## 남은 점

- 모바일 터치 실기기, Safari, 스크린리더, OS 파일 선택창은 직접 검증하지 않았다. 390px 검사는 Chromium 뷰포트 검사다.
- SVG/이미지 가져오기와 고급 마스크/그라디언트/불리언 등 전체 조합의 새 브라우저 회귀 검사는 이번 범위에 포함하지 않았다. 기존 해당 단위 테스트는 모두 통과했다.
- 작은 화면에서 패널을 열면 캔버스 하단 일부를 덮는다. 높이를 제한하고 닫기/스크롤을 제공한다. 패널을 자동 이동시키거나 실제 터치 사용성을 통과로 간주하지 않는다.
- 기존 Next 13.4.7/오래된 Browserslist 경고는 남아 있다. 의존성 대규모 업그레이드는 하지 않았다. 새 계정·결제·권한 확대 없음.
