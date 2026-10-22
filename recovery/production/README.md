# 운영 버전 복구 스냅샷

2026-10-22에 `recovery/production-20261022` 브랜치로 보존한 운영 버전입니다.

- 운영 주소: https://nijoow-drawing.vercel.app
- 운영 배포 ID: `dpl_54BeuMxmC8r742H12krnvavDPneP`
- 원본 소스 커밋: `7b2e36448a5b8b8969030ccd04a5de9fb3246a76`
- 원본 소스 551개 파일과 이전 개발 커밋 5개의 이력을 그대로 보존했습니다.
- 기존 미추적 Linux SWC 캐시 `.yarn/cache/@next-swc-linux-x64-gnu-npm-13.4.7-d1b349dd00-8.zip`도 포함했습니다.

저장소 루트에는 운영 버전의 원본 소스가 있습니다. 운영 빌드 당시에는 별도 사본의
`next.config.js`에만 `output: 'export'`를 추가했습니다. 그 설정은 이 폴더의
`next.config.js`에 보존했습니다. 루트의 기존 애플리케이션 파일은 변경하지 않았습니다.

## 보존한 파일

- `static/`: 운영 배포에 업로드한 정적 파일 25개, 총 1,278,908바이트.
- `files.json`: 정적 파일별 크기, 원래 업로드 SHA-1, SHA-256 체크섬.
- `source-files.json`: 원본 소스와 당시 미추적 파일의 SHA-256 체크섬.
- `next.config.js`: 운영 정적 빌드에 사용한 설정.
- `vercel.json`: Vercel 운영 배포에서 직접 읽어 보존한 정적 호스팅 설정.
- `deployment.json`: 운영 배포 ID, 소스 커밋, 빌드 방식과 당시 검증 기록.

루트의 `vercel.json`은 이 복구 브랜치의 Git 자동 배포를 차단합니다. 이 폴더의
동명 파일은 기존 운영 정적 파일 배포 설정이므로 역할이 다릅니다.
이번 보존 작업은 운영 배포나 Vercel 프로젝트 설정을 변경하지 않습니다.

## 파일 무결성 확인

저장소 루트에서 실행합니다.

```sh
python3 - <<'PY'
import hashlib, json
from pathlib import Path
root = Path('.')
backup = root / 'recovery/production'
sources = json.loads((backup / 'source-files.json').read_text())
for group in ('files', 'previouslyUntrackedFiles'):
    for name, expected in sources[group].items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name
for entry in json.loads((backup / 'files.json').read_text()):
    data = (backup / 'static' / entry['file']).read_bytes()
    assert len(data) == entry['size'], entry['file']
    assert hashlib.sha1(data).hexdigest() == entry['sha1'], entry['file']
    assert hashlib.sha256(data).hexdigest() == entry['sha256'], entry['file']
print('Source and production assets verified.')
PY
```

## 운영 산출물 로컬 미리보기

```sh
python3 -m http.server 3010 --bind 127.0.0.1 --directory recovery/production/static
```

브라우저에서 http://127.0.0.1:3010 을 엽니다. 이 명령은 로컬 서버만 시작합니다.

## 소스에서 정적 빌드 재현

새 작업 사본에서 Node.js 18.20.8과 저장소의 Yarn 3.6.0을 사용합니다.
운영 배포는 서버 런타임이 없는 정적 파일이며, Vercel 프로젝트의 Node.js 설정은 24.x입니다.

1. 이 브랜치를 새 폴더에 체크아웃합니다.
2. Node.js 18.20.8의 `node`를 PATH에서 선택합니다.
3. `node .yarn/releases/yarn-3.6.0.cjs install --immutable`로 의존성을 준비합니다.
4. `recovery/production/next.config.js`를 새 사본의 루트 `next.config.js`에 복사합니다.
5. `node .yarn/releases/yarn-3.6.0.cjs build`를 실행하면 `out/`에 정적 파일이 생성됩니다.

빌드 ID 등은 새 빌드마다 달라질 수 있습니다. 기존 운영 산출물을 정확히 복원할 때는
체크섬을 확인한 `static/`의 파일을 사용합니다. 생성 캐시와 설치 상태 파일은 재생성할 수
있으므로 별도로 보존하지 않았습니다. 브라우저 로컬 저장소의 사용자 문서는 소스에 포함되지 않습니다.
