# G-WKS-001 패키지 경계는 소비자 증거로 검증한다

- 상태: `ACTIVE`
- 적용 조건: manifest, package export, public type 또는 package dependency 변경

## 구현 규칙

- manifest의 허용·금지 dependency를 검사한다.
- `model`과 `io`를 DOM lib 없는 compiler fixture로 검사한다.
- core 공개 `.d.ts`에서 Tiptap·ProseMirror type 누수를 검사한다.
- 빌드된 package export만 사용하는 consumer fixture를 검사한다.

## 검증

```bash
pnpm check:boundaries
pnpm build
pnpm --filter consumer-fixture typecheck
```
