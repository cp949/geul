# PIT-0029 pnpm이 스크립트 뒤로 넘기는 플래그는 실제 커맨드라인을 echo해 확인한다

- 상태: `ACTIVE`
- 적용 영역: scripts·process
- 최초 근거: Issue #103

## 상황과 징후

`packages/core/package.json`의 `test` 스크립트는 `vitest run --root ../.. --project core`다. 여기에 vitest 플래그를 추가로 주려고

```bash
pnpm --filter @cp949/geul-core test -- --sequence.shuffle --no-isolate --no-file-parallelism
```

를 실행하면 pnpm이 실제로 실행하는 명령은

```bash
vitest run --root ../.. --project core -- --sequence.shuffle --no-isolate --no-file-parallelism
```

이다(`pnpm run <script> -- <args>`가 `<args>`를 스크립트 명령 뒤에 그대로 이어 붙이면서 `--`를 함께 넘긴다 — pnpm 11.21.0에서 실행 로그 첫 줄로 확인). vitest CLI에서 `--` **뒤**의 토큰은 옵션으로 파싱되지 않고 무해한 위치 인자(테스트 이름 패턴)로 처리된다. 그 패턴이 어떤 테스트 이름과도 겹치지 않으면 필터링 효과 없이 **평소와 똑같이 전체가 도는데, 의도한 플래그는 하나도 적용되지 않은 채** 통과 출력만 나온다 — 명령이 실패하면 바로 드러나지만 이건 "성공"으로 보고되므로 눈치채기 어렵다.

## 재현

```bash
pnpm --filter @cp949/geul-core test -- --sequence.shuffle --no-isolate --no-file-parallelism
# 로그 첫 줄: "$ vitest run --root ../.. --project core -- --sequence.shuffle --no-isolate --no-file-parallelism"
#            ^^ 이 "--"가 문제 — 뒤 플래그가 전부 무시된다
```

같은 플래그를 실제로 적용하려면 `pnpm`을 거치지 않고 패키지 디렉터리에서 vitest를 직접 호출한다.

```bash
cd packages/core && npx vitest run --root ../.. --project core --sequence.shuffle --no-isolate --no-file-parallelism
```

## 근본 원인

pnpm의 `run -- <args>` 전달 방식이 스크립트 문자열 뒤에 `-- <args>`를 그대로 잇는다. 스크립트 자신이 이미 완결된 명령(`vitest run --root ../.. --project core`)이면 그 뒤에 `--`가 새로 추가되는 형태가 되고, vitest 관점에서는 "여기까지가 옵션, 이 뒤는 전부 위치 인자"로 읽는다. `npm run`도 관례상 비슷한 전달 방식을 쓰므로 같은 함정이 있을 수 있다(이 저장소에서 직접 확인한 것은 pnpm 11.21.0뿐).

## 예방 규칙

- 이 저장소에서 vitest에 임시 플래그(`--sequence.shuffle`, `--no-isolate`, `--no-file-parallelism`, `--reporter=json` 등)를 추가로 주려면 **`pnpm --filter <pkg> <script> -- <플래그>` 형태를 쓰지 않는다.** 대상 패키지 디렉터리로 이동해 `npx vitest run --root ../.. --project <프로젝트명>`을 직접 호출하고 그 뒤에 플래그를 붙인다.
- 이런 임시 플래그 실행의 결과를 문서(`_meta.md`, `IMPL-REVIEW-*.md`, `03-최종-완료-체크리스트.md`, 이슈 댓글 등)에 근거로 남길 때는 **실행 로그의 첫 줄(실제로 호출된 명령 echo)을 함께 확인**하고, 의도한 플래그가 그 줄에 그대로(추가 `--` 없이) 나타나는지 본다. "통과했다"만으로는 플래그가 실제로 적용됐는지 증명하지 못한다.
- `pnpm scan:*` 같은 이 저장소의 다른 pass-through 스크립트도 같은 위험이 있는지 필요할 때 같은 방식(echo된 실제 명령 확인)으로 점검한다.

## 검증 방법

임시 플래그를 쓰는 검증 명령을 문서에 적기 전에 한 번 실행해 echo되는 실제 명령줄에 그 플래그가 (추가 `--` 없이) 그대로 나타나는지 확인한다.

## 실제 근거

- Issue #103 트랙-4·트랙-5가 `pnpm --filter @cp949/geul-core test -- --sequence.shuffle --no-isolate --no-file-parallelism`로 "packages/core 전량이 그 조합에서 반복 통과"라고 기록했으나, 실제로는 그 실행이 플래그 없는 기본 실행과 동일했다. 트랙-6이 `npx vitest`로 직접 재실행해서야 그 조합이 실제로는(당시 코드에서) 8회 중 4회 실패함을 발견했다 — 이전 기록은 검증되지 않은 주장이었다.
- 트랙-6이 `pnpm`을 거치지 않은 정정된 명령으로 재실측해 관련 문서의 근거 문구를 정정했다.

## 관련 문서

- [PIT-0028 공용 모듈이 소유하는 정리 훅은 파일 경계마다 실행되게 만든다](./PIT-0028-scope-shared-teardown-hooks-to-run-per-file.md) — 이 함정 때문에 그 결함의 최초 검증이 무효였다.
