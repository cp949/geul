/**
 * `attributeOverrides.blockContainer`/`blockGroup` 역할이 공유하는 병합
 * 규칙(spec §7, R4 슬라이스5 RD-002-DELTA-02, roadmap.md "결정" — attribute
 * 병합·충돌 규칙). `editor` 역할(RD-002-DELTA-01)은 ProseMirror
 * computeDocDeco()가 class 병합을 네이티브로 처리해 이 헬퍼가 필요 없다 —
 * blockContainer/blockGroup은 core가 직접 `renderHTML`을 작성하므로 여기서
 * 같은 규칙을 우리가 구현한다.
 *
 * `class`는 base와 overrides 양쪽 값을 공백으로 join한다(어느 한쪽이
 * 비었으면 나머지 값만 쓴다 — 선행/후행 공백 없음). 그 외 키는 `base`에
 * 이미 존재하거나(core가 이미 채운 필수 attribute) `data-geul-` 접두어면
 * (core/model round-trip 계약의 예약 네임스페이스, Issue #159 이력) 무시하고
 * `console.warn`을 낸다. 그 외에는 그대로 병합한다.
 *
 * `process.env.NODE_ENV` 게이팅을 하지 않는다 — `custom-keyboard-shortcuts-
 * extension.ts`의 겹침 경고 선례와 동일하게 무조건 경고하고(core는 브라우저
 * 타깃이라 `process` 전역이 타입 선언 없음), 소비자가 실수를 프로덕션에서도
 * 바로 알아채게 한다.
 */
export const mergeAttributeOverrides = (
  base: Record<string, string>,
  overrides: Record<string, string> | undefined,
): Record<string, string> => {
  if (overrides === undefined) return base;

  const merged: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (key === "class") {
      merged.class = [base.class, value]
        .filter((part): part is string => part !== undefined && part.length > 0)
        .join(" ");
      continue;
    }

    const reserved = key.startsWith("data-geul-") || key in base;
    if (reserved) {
      console.warn(
        `[geul] attributeOverrides: "${key}"는 예약되었거나 이미 core가 관리하는 attribute라 무시됩니다.`,
      );
      continue;
    }

    merged[key] = value;
  }
  return merged;
};
