export type MenuPosition = { left: number; top: number };

/**
 * 대상 블록의 렌더된 DOM(`[data-be-block-id]`, RD-002 DELTA-01 계약)
 * bounding rect를 읽어 그 아래 앵커할 좌표를 구한다. `FilePanel`(RD-003
 * DELTA-01)과 `MediaToolbar`(RD-004 DELTA-01) 둘 다 같은 media 블록 DOM을
 * 서로 다른 시점(빈 블록 편집 vs 채워진 블록 편집)에 앵커하는 데 쓴다 —
 * media 블록은 atom이라 텍스트 range가 아니라 NodeSelection이고, 이
 * selector는 selection range 해석 없이도 항상 존재하는 안정 계약이라
 * 두 컴포넌트가 그대로 공유한다.
 */
export const readBlockBounds = (
  element: HTMLElement,
  blockId: string,
): MenuPosition | null => {
  const target = element.querySelector<HTMLElement>(
    `[data-be-block-id="${blockId}"]`,
  );
  if (target === null) return null;
  const rect = target.getBoundingClientRect();
  return { left: rect.left + rect.width / 2, top: rect.bottom };
};

/**
 * 대상 블록 DOM을 못 찾았을 때(드문 경우)만 쓰는 임의 뷰포트 안쪽 좌표 —
 * link-toolbar.tsx의 같은 이름 상수와 같은 이유(정확한 값에는 의미가 없다,
 * `useClampedMenuPosition`이 결국 뷰포트 안으로 접어 넣는다).
 */
export const FALLBACK_BLOCK_POSITION: MenuPosition = { left: 96, top: 48 };
