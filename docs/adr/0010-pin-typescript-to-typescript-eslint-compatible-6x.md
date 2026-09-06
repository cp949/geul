---
status: accepted
---

# typescript를 typescript-eslint와 호환되는 6.x에 고정한다

Geul은 `typescript`를 7.x(네이티브 Go 컴파일러) 대신 `typescript-eslint`(8.68.0)의 peer 상한(`>=4.8.4 <6.1.0`) 안에 있는 6.0.3에 고정한다. TS7 GA(2026-07-08)는 `tsc` 바이너리만 내고 `import`로 불러올 수 있는 컴파일러 API를 아직 내지 않는다(2026-09-06 기준 TS 7.1도 미출시) — `typescript-eslint`는 이 API에 의존해 파싱하므로 TS7 위에서는 타입 인지 여부와 무관하게 파싱 자체가 안 되고, TS7 지원 요청 이슈는 `typescript-eslint` 쪽에서 `not_planned`로 닫혔다. 2026-08-26 커밋 `fd21506`이 이 사유로 `typescript` 7.0.2→6.0.3 다운그레이드를 결정했고, 2026-09-06 Issue #157 툴체인 업그레이드(Node/pnpm/eslint-plugin-es-x/vitest 상향)에서도 이 항목만 제외 범위로 재확인했다. 이 ADR은 그동안 `docs/history/`에만 흩어져 있던 그 결정을 영속 기록으로 옮긴다.

## Consequences

- `typescript-eslint`가 TS7 네이티브 컴파일러 API 위에서 동작하도록 대응하고 그 신규 버전이 릴리스되기 전까지, `typescript`는 6.1.0 미만으로 유지한다.
- 재검토 트리거: TS 7.1(또는 이후 버전)이 재-import 가능한 컴파일러 API를 내고 `typescript-eslint`가 그 위에서 동작을 지원하면, 이 ADR을 갱신하거나 대체(superseded)한다.
- pnpm·eslint-plugin-es-x·vitest 등 나머지 툴체인 업그레이드는 이 제약과 무관하게 독립적으로 진행할 수 있다(Issue [#157](https://github.com/cp949/geul/issues/157)이 실제로 그렇게 했다).
- 근거 이력: 커밋 `fd21506`(2026-08-26, 최초 다운그레이드), Issue [#157](https://github.com/cp949/geul/issues/157)(2026-09-06, 재확인), `docs/history/20260906-04-issue157-toolchain-upgrade.md`.
