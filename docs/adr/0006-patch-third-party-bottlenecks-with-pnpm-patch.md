---
status: accepted
---

# 제거 불가능한 서드파티 병목은 pnpm patch로 고치고 결정적 단언으로 고정한다

Geul의 변환 경로는 remark/micromark, rehype, Tiptap처럼 이미 풀린 문제를 외부 라이브러리에 맡긴다(ADR 0005). 그 라이브러리 내부에 사용자가 체감하는 병목이 있고 우리 코드에서 우회할 수 없을 때, 저장소는 세 가지를 선택할 수 있다: 입력 상한과 타임아웃으로 증상만 덮거나, 라이브러리를 fork·vendoring하거나, 대체 라이브러리로 갈아타거나. 셋 다 비용이 실제 이득보다 크다 — 증상 덮기는 사용자 지연을 그대로 남기고(Issue #12가 타임아웃을 20,000ms로 올렸지만 markdown import는 여전히 수 초 걸렸다), fork는 업스트림의 보안·버그 수정 흐름을 끊으며, 생태계 교체는 변환 의미론 전체를 다시 검증하게 만든다. 따라서 **의미를 바꾸지 않고 비용만 줄이는 국소 수정에 한해 `pnpm patch`로 서드파티 패키지를 직접 패치하고, 패치를 `patches/`에 커밋한다.** 패치는 의존성 그래프와 업스트림 추적을 그대로 두면서 특정 버전에만 붙는 되돌릴 수 있는 수정이기 때문이다. 최초 적용은 Issue #26의 `micromark-extension-gfm-table@2.1.1` `EditMap` 선형 스캔 제거다.

## Consequences

- 패치는 **출력이 동일한 비용 절감**으로만 한정한다. 산출물의 의미가 달라지면 그것은 패치가 아니라 계약 변경이므로 `docs/specs/`와 사용자 승인이 먼저다. 패치를 넣을 때 동일 출력임을 대조한 근거를 이슈나 커밋에 남긴다.
- `patchedDependencies` 키는 exact version으로 고정한다(`micromark-extension-gfm-table@2.1.1`). 그래야 버전이 올라 패치가 뜨면 pnpm이 `ERR_PNPM_UNUSED_PATCH`로, 패치가 붙지 않으면 `ERR_PNPM_PATCH_FAILED`로 install을 깬다. 락파일의 `patch_hash`가 패치 파일 내용까지 고정하므로 CI의 `pnpm install --frozen-lockfile`이 유실·변조를 결정적으로 잡는다.
- pnpm의 install 검사가 잡지 못하는 것은 **적용은 됐지만 일부 사본에만 적용된 반쪽 패치**다. 패키지 `exports`가 조건별로 다른 사본을 가리키면(`development` vs `default`) 테스트가 타는 사본만 패치돼도 전부 초록이 된다. 패치를 도입하면 조건별 사본 전부를 검사하는 결정적 단언을 함께 추가한다(G-TST-004, `packages/io/test/micromark-table-patch-integrity.test.ts`). 시간 상한은 이 역할을 못 한다.
- 패치 대상은 수정 배포를 허용하는 permissive 라이선스(MIT, ISC, BSD, Apache-2.0)로 한정한다. 패치는 수정된 서드파티 코드를 배포하는 행위이므로 `docs/product/dependency-licenses.md`에 패치 사실과 대상을 기록한다. 전이 의존성이라 direct dependency 표에 행이 없어도 각주로 남긴다.
- 패치 파일 안에 도입 이슈 번호를 주석으로 남긴다(`cp949/geul#26`). 의존성을 올릴 때마다 업스트림에 동일 수정이 반영됐는지 확인하고, 반영됐으면 패치를 제거한다. 패치는 영구 자산이 아니라 업스트림이 따라올 때까지의 임시 상태다.
- 패치 개수를 늘리지 않는다. 같은 라이브러리에 패치가 두 개 이상 필요해지면 그것은 라이브러리 선택 자체를 다시 볼 신호이고, ADR 0005의 seam 판정으로 되돌아간다.
