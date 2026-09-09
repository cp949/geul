---
status: accepted
---

# Import HTML에서 표 내부는 조상 인라인 마크를 적용하지 않는다

Import HTML로 문서를 가져올 때 `<table>` 내부(셀 텍스트 등)는 바깥을 감싼 인라인 마크 조상(`<a>`, `<strong>` 등)을 어떤 진입 경로로도 물려받지 않는다. 표가 문서 루트에 직접 인라인 마크로 감싸인 경우, blockquote 안에 중첩된 경우, list(`ul`/`ol`/`li`) 안에 중첩된 경우 셋 다 동일하다.

이 규칙은 새로 만든 것이 아니라 현재(`dev`) 코드의 실제 동작을 그대로 확정한 것이다. `packages/io/src/html/block-segmenter.ts`의 `walk()`가 표를 만나면(top-level 직접 중첩) `nonSectionChildren`(caption 등 표 밖 요소)에만 조상 마크를 씌우고 표 노드 자신은 원본 그대로 세그먼트에 넣는다. blockquote/list 세그먼트를 만드는 `wrapTextDescendantsInAncestors`도 `isTableNode`에 걸리는 노드는 재귀하지 않고 원본 참조를 그대로 반환한다 — clipboard 표 파싱(`clipboard-table-parser.ts`)의 `tableSet`(node identity 멤버십) 판정을 지키기 위한 제약이 표 서브트리 전체에 적용된 결과다.

## 왜 지금 확정하는가

Issue #145가 이 규칙이 최근 바뀐 회귀인지 물었다. 조사 결과 세 경로의 **현재** 동작은 이미 일관되지만, **과거** 동작은 그렇지 않았다.

- top-level `<a><table>` 직접 중첩: 이전부터 지금까지 계속 미상속이었다. `walk()`의 `kind:"table"` 분기는 애초에 표 노드를 감싸지 않았다.
- blockquote/list 중첩: Issue #143 DELTA-01(`06cd986`)이 `wrapTextDescendantsInAncestors`에 `isTableNode` 조기 반환을 추가하기 전에는 표 내부까지 무조건 재귀해 조상 마크를 상속시켰다. 그 커밋 이후에야 top-level 경로와 같은 미상속으로 바뀌었다(li 안 중첩 표는 그 이전에도 이 함수를 거쳤으므로 blockquote와 같은 시점에 같이 바뀌었다).

즉 "복원해야 할, 예전부터 있던 일관된 규칙"은 존재하지 않았다 — 예전에는 진입 경로에 따라 갈렸고, 지금이 오히려 유일하게 self-consistent한 상태다. blockquote/list 상속만 복원하면 top-level 경로와 다시 갈리는 규칙이 되고, top-level까지 포함해 전부 상속시키려면 clipboard 표 identity 판정과 충돌할 위험까지 Import HTML 범위 밖으로 번진다. 두 대안 모두 지금보다 못하다는 판단으로 현재 동작을 공식 계약으로 확정한다.

## Consequences

- Import HTML로 가져온 문서에서 표 셀은 표를 감싼 조상의 링크·볼드 등 인라인 마크를 갖지 않는다. 이 계약을 전제로 한 회귀 테스트(`packages/io/test/html-security-block-boundary.test.ts`)가 top-level·blockquote·list 세 경로를 고정한다.
- 표 내부 조상 마크 상속을 새로 지원하려면(향후 요구가 생기면) 이 ADR을 대체하는 새 ADR을 추가하고, 최소한 clipboard 표 identity 판정과의 상호작용을 함께 재검토해야 한다.
- clipboard HTML 붙여넣기 경로(`clipboard-table-parser.ts`)는 이 ADR의 직접 대상이 아니다 — 같은 `wrapTextDescendantsInAncestors`를 공유하지만 표 식별 자체가 다른 메커니즘(`tableSet` node identity)이라 별도 계약이다.
