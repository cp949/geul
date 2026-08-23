# PIT-0028 공용 모듈이 소유하는 정리 훅은 파일 경계마다 실행되게 만든다

- 상태: `ACTIVE`
- 적용 영역: core·test
- 최초 근거: Issue #103

## 상황과 징후

`table-test-support.ts`(Issue #103)와 `editor-controller-support.ts`(Issue #91)는 같은 패턴을 쓴다 — 소유 모듈이 `Set<Editor | EditorController>`를 module-scope에 두고, 모듈 import 시점에 `afterEach(() => { for (const e of set) e.destroy(); set.clear(); })`를 등록한다. vitest 기본 설정(`isolate: true`, 파일마다 모듈 레지스트리 리셋)에서는 각 테스트 파일이 그 모듈을 다시 평가해 자기 파일의 스위트에 정상적으로 hook을 등록하므로 항상 동작한다.

그런데 `--no-isolate --no-file-parallelism`(shuffle 없이도 재현)으로 돌리면 module-scope 최상단의 `afterEach(...)` 호출이 **그 모듈을 가장 먼저 import한 파일의 컬렉션 시점에 딱 한 번만 실행**되고, 그 뒤 같은 프로세스 안에서 이 모듈을 재-import하는 다른 테스트 파일들은 캐시된 export만 받아 자기 스위트에 이 hook이 전혀 등록되지 않는다. 어느 파일이 "가장 먼저"가 되는지가 매 프로세스 실행마다 갈려 실패가 간헐적이다(관찰: 동일 커맨드를 8회 반복 중 4회 실패).

`table-test-support.test.ts`에 "afterEach가 실제로 이 파일에서 실행됐는가"를 직접 단언하는 계약 테스트가 있으면 그 단언이 8회 중 절반 정도 실패한다. `editor-controller-support.test.ts`는 같은 조건에서 같은 실패를 보이지 않지만, 원인은 메커니즘이 안전해서가 아니라 **그 파일에 이런 직접 단언이 없기 때문**이다 — 위험은 두 모듈 모두에 이미 잠재해 있다.

## 재현

```bash
cd packages/core
for i in $(seq 1 8); do npx vitest run --root ../.. --project core --no-isolate --no-file-parallelism; done
```

`isolate`와 `file-parallelism`을 각각 단독으로 끄면(둘 중 하나만) 재현되지 않는다 — 두 조건이 **함께** 있어야 한다.

## 근본 원인

vitest의 `describe`/`it`/`afterEach` 등록은 "현재 컬렉션 중인 스위트" 컨텍스트에 바인딩된다. `isolate: false`는 파일 경계에서 모듈 레지스트리를 리셋하지 않으므로, 두 번째 이후 파일이 같은 모듈을 import해도 모듈 최상단 코드(즉 `afterEach(...)` 호출 자체)가 다시 실행되지 않는다 — 그 파일의 컬렉션 컨텍스트에는 아무 hook도 등록되지 않는다. `file-parallelism: true`(기본값)에서는 파일마다 별도 워커/포크가 뜨는 경우가 있어 모듈 캐시가 파일 간에 공유되지 않을 수 있으므로, 이 결함은 "모듈 캐시가 진짜로 파일 경계를 넘어 공유되는" 조건(`isolate: false` **그리고** `file-parallelism: false`)에서만 관찰된다.

같은 정리 로직에 별도 원인의 관련 결함도 있다: `for (const editor of fixtureEditors) editor.destroy();` 루프에 `try/catch`가 없다 — 등록된 에디터 중 하나의 `destroy()`가 던지면 루프가 그 지점에서 멈추고 `Set.clear()`에 도달하지 못한다. 나머지가 Set에 남아 다음 `it`의 `afterEach`가 재시도하고, 다시 던지면 그 파일의 남은 모든 `it`이 연쇄 실패한다. 실측(Issue #103 시점): 저장소 테스트 전 구간에서 `destroy()`가 던진 사례는 없다 — 관측된 결함이 아니라 하드닝 여지다.

## 예방 규칙

- module-scope 소유 정리 훅에 "afterEach가 실행됐는가"를 직접 단언하는 계약 테스트를 새로 짤 때는, 소유 모듈이 등록만 하고 실행은 vitest 훅 스케줄링에 맡기는 구조 대신, **정리 로직을 이름 붙은 함수로 분리해 export**하고 계약 테스트가 그 함수를 직접 호출해 검증하게 한다(vitest의 훅 등록·실행 타이밍에 어떤 가정도 걸지 않는다). Issue #103이 `table-test-support.ts`에 `destroyFixtureEditorsForTest`로 이 형태를 도입했다 — `editor-controller-support.ts`는 아직 이 형태가 아니다.
- 새 공용 정리 모듈을 만들 때 `isolate: false` 조합에서의 동작을 요구사항에 넣을 것인지 먼저 정한다. 이 저장소의 실제 게이트(`pnpm --filter @cp949/geul-core test`, `pnpm test`, `pnpm verify`, CI)는 이 플래그 조합을 쓰지 않으므로 "완벽히 isolate-무관"을 요구하는 것은 과잉이다 — 대신 벤치마크·속도 개선 목적으로 `isolate`를 끄는 변경이 나오면 **그 변경의 검증 항목에 module-scope 소유 정리 훅 전수 재검토를 넣는다.**
- 정리 루프는 `try/catch`로 개별 에디터 실패를 격리하고 마지막에 실패 목록을 집계해 던지는 형태로 하드닝하는 것을 고려한다(제안, 미실행) — `destroy()`가 idempotent라는 사실만으로는 "던지지 않는다"가 보장되지 않는다.

## 검증 방법

```bash
cd packages/core
for i in $(seq 1 8); do npx vitest run --root ../.. --project core --no-isolate --no-file-parallelism; done
```

8회 전부 통과해야 한다. 실패하면 어느 파일의 계약 테스트가 걸렸는지 확인하고, 그 파일이 module-scope 소유 정리 훅에 "훅이 실행됐는가"를 직접 단언하는지 본다.

## 실제 근거

- Issue #103 트랙-6(결함 탐지), 렌즈 "격리·동시성" subagent 최초 보고. 메인 세션이 `dev`의 `editor-controller-support.test.ts`로 대비 재검증(8회 반복, 0/8 실패 — 직접 단언이 없어 통과했을 뿐임을 확인).
- 같은 트랙에서 `table-test-support.test.ts`의 해제 계약 테스트를 `destroyFixtureEditorsForTest` 분리 + 순서 무관 단일 `it`로 재작성해 위 형태를 도입, 수정 후 8/8·10/10 통과로 확인.

## 관련 문서

- [PIT-0017 document.body에 직접 붙인 테스트 노드는 finally에서 정리한다](./PIT-0017-clean-up-body-appended-test-nodes-in-finally.md)
- [PIT-0022 테스트 헬퍼는 두 번째 파일에서 복제하지 말고 공용 모듈이 단독 소유한다](./PIT-0022-own-test-helpers-in-a-shared-module.md) — 이 발견은 그 소유 모듈 **자신의** 정리 메커니즘이 갖는 실행 조건 의존성이다.
