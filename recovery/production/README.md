# 정적 배포 백업

2026-10-22 배포 파일을 보관한 폴더입니다. 현재 소스는 저장소 루트에 있습니다.

- `static/`: 당시 배포한 정적 파일
- `files.json`: 정적 파일 크기와 체크섬
- `source-files.json`: 당시 소스 체크섬
- `next.config.js`, `vercel.json`: 정적 빌드·호스팅 설정
- `deployment.json`: 배포 식별 정보

## 로컬 미리보기

```sh
python3 -m http.server 3010 --bind 127.0.0.1 --directory recovery/production/static
```

- 주소: http://127.0.0.1:3010
- 사용자 브라우저에 저장된 문서는 포함하지 않음.
- 루트 소스는 이후 변경되었으므로 당시 소스 체크섬과 일치하지 않을 수 있음.
