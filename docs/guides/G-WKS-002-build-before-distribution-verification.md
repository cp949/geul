# G-WKS-002 배포 소비 검증 전에 workspace를 build한다

- 상태: `ACTIVE`
- 적용 조건: consumer fixture, package export 또는 E2E 검증
- 관련 함정: [`PIT-0006`](../pitfalls/PIT-0006-build-before-distribution-verification.md)

## 실행 순서

```bash
pnpm build
pnpm --filter consumer-fixture typecheck
pnpm test:e2e
```

생성된 `dist`는 검증 입력이다. 소스처럼 편집하거나 커밋하지 않는다.
