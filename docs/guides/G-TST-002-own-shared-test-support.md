# G-TST-002 두 번째 테스트 파일부터 공용 test support가 지식을 소유한다

- 상태: `ACTIVE`
- 적용 조건: 같은 fixture·helper·DOM 조작·provider 조립이 두 테스트 파일에서 필요
- 관련 함정: [`PIT-0028`](../pitfalls/PIT-0028-scope-shared-teardown-hooks-to-run-per-file.md)

## 구현 규칙

- 사본 두 벌이 생기는 시점에 package의 공용 test support로 올린다.
- 파라미터는 오용을 잡는 데 필요한 최소 구조 타입으로 선언한다. `unknown`, 무제약 generic과 `Partial<전체 타입>`을 기본값으로 쓰지 않는다.
- 기법의 이유는 공용 모듈이 단독 소유한다. 다른 테스트 파일이나 행 번호를 근거로 인용하지 않는다. 공용 모듈의 계약 테스트가 자기 전제에 기대는 소비자를 이름으로 가리키는 주석은 예외로 둔다 — 원본이 소비자를 가리키는 방향이라 사본이 원본을 가리키는 반대 방향과 다르다. 이때도 줄 번호는 인용하지 않는다.
- 공용 모듈의 비자명한 주장은 계약 테스트로 고정하고, 두 구현이 갈리는 입력으로 RED를 확인한다.
- 이름·본문 탐지기가 놓치는 동일 지식은 고유 API·속성 토큰으로 추가 검색한다.

## 검증

```bash
pnpm scan:test-helpers
rg -n '(test|spec)\.(tsx|ts)`?[가-힣]' packages/*/test e2e tests
rg -n '(test|spec)\.(tsx|ts):[0-9]+' packages/*/test e2e tests
```

추출 전후 기존 테스트 제목 집합을 JSON reporter로 비교한다. 추출만 하면 차이가 없어야 하고, 계약 테스트를 추가했다면 기존 제목 삭제 없이 추가만 있어야 한다.
