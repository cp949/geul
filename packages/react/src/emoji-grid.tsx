import type { CSSProperties, RefObject } from "react";

import type { EmojiOption } from "./emoji-picker-options.js";

export type EmojiGridProps = {
  ariaLabel: string;
  items: readonly EmojiOption[];
  highlightedIndex: number;
  emptyMessage: string;
  onSelect: (item: EmojiOption) => void;
  menuRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
};

/**
 * 이모지 grid 팝업의 순수 표시 컴포넌트(Issue #209 RD-004 DELTA-02) —
 * `emoji-picker.tsx`의 `:` 트리거 팝업에서 추출했다. 트리거 감지(`:쿼리`
 * 텍스트 매치)·삽입 방식(`setText` 블록 치환)은 이 컴포넌트의 관심사가
 * 아니다 — `onSelect`로 선택된 항목만 알려주고 그 다음은 호출자가
 * 정한다. `callout-icon-picker.tsx`가 같은 grid를 클릭 트리거+
 * `setCalloutIcon` 호출로 재사용한다. className은 리팩터링 전과 동일하게
 * 유지한다(`_emoji-picker.scss`, 기존 emoji-picker 테스트가 접근성
 * 속성만 검증해 클래스명 자체는 계약이 아니지만 신규 scss를 만들지
 * 않기 위해 그대로 둔다).
 */
export const EmojiGrid = ({
  ariaLabel,
  items,
  highlightedIndex,
  emptyMessage,
  onSelect,
  menuRef,
  style,
}: EmojiGridProps) => (
  <div
    aria-label={ariaLabel}
    className="geul-emoji-picker"
    ref={menuRef}
    role="listbox"
    style={style}
  >
    {items.length === 0 && (
      <p className="geul-emoji-picker__empty">{emptyMessage}</p>
    )}
    <div className="geul-emoji-picker__grid">
      {items.map((item, index) => (
        <button
          aria-label={item.label}
          aria-selected={index === highlightedIndex}
          className="geul-emoji-picker__item"
          key={item.id}
          onClick={() => onSelect(item)}
          onPointerDown={(event) => event.preventDefault()}
          role="option"
          type="button"
        >
          {item.char}
        </button>
      ))}
    </div>
  </div>
);
