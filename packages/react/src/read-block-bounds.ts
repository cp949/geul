export type MenuPosition = { left: number; top: number };

/**
 * 대상 블록의 렌더된 DOM(`[data-geul-block-id]`, RD-002 DELTA-01 계약)
 * bounding rect를 읽어 그 아래 중앙에 앵커할 좌표(`centerBelow`)를 구한다.
 * `FilePanel`(RD-003 DELTA-01) 전용이다 — url 없는 빈 미디어 블록(atom)을
 * 채우는 동안 그 블록 바로 아래에 뜬다. `MediaToolbar`는 더는 이 함수를
 * 쓰지 않는다(Issue #203) — 리사이즈로 블록 높이가 아주 작아지면
 * centerBelow 앵커가 다음 블록과 겹쳐, 대신 블록 우상단에 앵커하는
 * `readBlockTopRightBounds`로 옮겼다. 두 함수 다 이 selector는 selection
 * range 해석 없이도(media 블록은 atom이라 NodeSelection) 항상 존재하는
 * 안정 계약이라는 점은 그대로 공유한다.
 */
export const readBlockBounds = (
  element: HTMLElement,
  blockId: string,
): MenuPosition | null => {
  const target = element.querySelector<HTMLElement>(
    `[data-geul-block-id="${blockId}"]`,
  );
  if (target === null) return null;
  const rect = target.getBoundingClientRect();
  return { left: rect.left + rect.width / 2, top: rect.bottom };
};

/**
 * 대상 블록의 렌더된 DOM bounding rect 우상단에 앵커할 좌표(`topRight`)를
 * 구한다. `MediaToolbar`(RD-004 DELTA-01) 전용이다(Issue #203) — `⋯` more
 * 트리거를 블록 우상단 모서리에 고정해, 리사이즈로 블록이 아주 좁고 낮아져도
 * (예: 64px 폭 이미지는 세로 높이도 함께 줄어든다) toolbar가 다음 블록의
 * bounding box와 겹치지 않게 한다 — `centerBelow`(위 `readBlockBounds`)는
 * 블록 아래로 펼치는 만큼 이 조건에서 다음 블록과 겹친다. `left`/`top`은
 * `useClampedMenuPosition`의 `"topRight"` anchor 계약과 짝을 이룬다 —
 * 그 anchor를 쓰는 컴포넌트의 CSS가 `transform: translateX(-100%)`로
 * 렌더된 박스를 왼쪽으로 밀어 우상단이 이 좌표와 일치하게 만든다
 * (`code-block-language-combobox.tsx`의 outer toolbar와 같은 패턴).
 */
export const readBlockTopRightBounds = (
  element: HTMLElement,
  blockId: string,
): MenuPosition | null => {
  const target = element.querySelector<HTMLElement>(
    `[data-geul-block-id="${blockId}"]`,
  );
  if (target === null) return null;
  const rect = target.getBoundingClientRect();
  return { left: rect.right, top: rect.top };
};

/**
 * 대상 블록 DOM을 못 찾았을 때(드문 경우)만 쓰는 임의 뷰포트 안쪽 좌표 —
 * link-toolbar.tsx의 같은 이름 상수와 같은 이유(정확한 값에는 의미가 없다,
 * `useClampedMenuPosition`이 결국 뷰포트 안으로 접어 넣는다).
 */
export const FALLBACK_BLOCK_POSITION: MenuPosition = { left: 96, top: 48 };
