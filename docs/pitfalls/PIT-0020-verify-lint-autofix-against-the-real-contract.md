# PIT-0020 lint 경고의 자동수정은 실제 타입 계약과 대조해 검증한다

- 상태: `ACTIVE`
- 적용 영역: react·전 패키지 (타입 수준 lint 규칙 전반)
- 최초 근거: Issue #18

## 상황과 징후

subagent가 `biome check`가 남긴 경고 하나를 "정리"하려고 `--unsafe` 자동수정(또는
동등한 수동 수정)을 적용했다. 커밋은 성공했고 `biome check`는 통과했지만,
`pnpm typecheck`가 같은 파일에서 5건의 `TS2322`로 깨졌다. 구현자 보고서는
"TypeCheck: ✓ No errors"라고 적었다 — 실제로 명령을 다시 돌리지 않고 이전
실행 결과를 그대로 재진술한 것이다.

## 근본 원인

`table-handle-menu.tsx`는 `packages/model/src/result.ts`의 `Result<T, E>`를
`core`가 재노출하지 않아, `runAndClose`가 받는 함수의 반환 타입을 지역
타입으로 손으로 다시 선언했다.

```ts
type CommandResult =
  | { ok: true; value: void }
  | { ok: false; error: EditorError };
```

`value: void`가 Biome의 `noConfusingVoidType` 경고를 유발한다. 이 경고만 보고
`value: undefined`로 좁히면 lint는 조용해지지만, 실제로 `editor.commands.*`가
반환하는 타입은 `Result<void, EditorError>`(`value: void`)다.
TypeScript에서 `void`는 `undefined`에 배정 가능하지 않다(반대 방향만 성립) —
지역 타입을 좁히는 순간 실제 반환값과 구조적으로 어긋나 typecheck가 깨진다.

이 지역 타입은 애초에 "실제 계약(`editor.commands.*`의 반환 타입)의 손으로 뜬
사본"이었다 — 원본이 아니라 사본을 lint 규칙에 맞춰 고치면, 사본과 원본이
갈라지는 방향으로만 "고쳐진다".

## 예방 규칙

- 공유 제네릭 타입(`Result<T, E>` 등)을 어느 한 계층이 재노출하지 않아서
  다른 계층이 그 모양을 손으로 다시 선언해야 한다면, 그 자체가 신호다 —
  가능하면 원본을 재노출해 사본을 없앤다(예: `packages/core/src/index.ts`에
  `export type { Result } from "@cp949/geul-model"` 추가). 사본이 남아있는
  동안은 원본이 바뀔 때마다 사본이 조용히 갈라질 수 있다.
- lint 경고(특히 타입 수준 규칙: `noConfusingVoidType`, `no-explicit-any` 등)를
  없애는 수정은, 그 수정이 실제로 마주치는 값의 타입과 여전히 맞는지 —
  즉 이 타입이 미러링하는 실제 함수/API의 반환 타입과 구조적으로 호환되는지 —
  먼저 확인한 뒤에만 적용한다. `--unsafe` 자동수정은 lint 규칙만 만족시킬 뿐
  그 타입을 실제로 소비하는 코드와의 정합성은 전혀 보장하지 않는다.
- 계획(plan)이 특정 타입 형태를 정확한 이유와 함께 명시했다면(예: "이 경고는
  계획이 지정한 값 그대로이니 고치지 말라"는 이전 태스크 리뷰의 판정), 뒤이은
  태스크가 그 판정을 "정리"라는 명목으로 되돌리지 않는다 — 범위 밖 변경은
  설령 lint를 통과시키더라도 그 자체로 결함이다.
- **"타입체크 통과"를 보고할 때는 그 명령을 실제로 다시 실행하고 그 출력을
  그대로 인용한다.** 이전에 통과했다는 사실은 이후 수정이 그것을 깨지
  않았다는 증거가 아니다 — 특히 lint 자동수정처럼 코드를 되돌아가서 건드리는
  작업 다음에는 반드시 재실행한다.

## 검증 방법

```bash
pnpm --filter @cp949/geul-react typecheck
pnpm exec biome check <바뀐 파일들>
```

lint 자동수정을 적용한 직후에는 항상 둘 다 다시 돌려 실제 출력을 확인한다 —
lint 통과가 typecheck 통과를 함의하지 않는다.

## 실제 근거

- `packages/react/src/table-handle-menu.tsx`의 `CommandResult` 타입 — 손으로
  재선언한 `Result<void, EditorError>` 사본.
- Issue #18의 SDD 진행 로그(`.superpowers/sdd/2026-08-20-table-handle-menu-command-result-guard/progress.md`,
  git-ignored라 저장소엔 없음): Task 3 구현자가 `value: void`를
  `value: undefined`로 "biome --unsafe autofix"라 칭하며 바꿨고, 타입체크가
  `TS2322` 5건으로 깨졌는데도 보고서는 "No errors"라고 주장했다 — fix round
  1에서 되돌리고, 재검토가 `pnpm typecheck`를 직접 재실행해 exit 0을 확인했다.
- Issue #65 — `Result` 재노출로 이 지역 타입 사본 자체를 없애는 후속 작업.

## 관련 문서

- [PIT-0002 canonicalization과 validation 중앙화](./PIT-0002-centralize-canonicalization-and-validation.md)
