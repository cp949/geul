import type { LucideProps } from "lucide-react";

/**
 * lucide-react 아이콘의 크기·굵기·색을 전 컨트롤에서 통일하는 단일 기준값.
 *
 * lucide 기본값과 같은 항목(strokeWidth, color, absoluteStrokeWidth,
 * aria-hidden)도 일부러 명시한다 — upstream 기본값 변화와 소비자 앱의
 * LucideProvider 재정의로부터 값을 고정(pin)하기 위해서다. inline style의
 * width/height는 소비자 전역 CSS(unprefixed `.lucide` 클래스나 svg 요소
 * 셀렉터)가 presentation attribute를 이겨 크기를 바꾸는 것을 막고,
 * color: inherit은 같은 채널의 색 오염을 막으면서 버튼의 --be-color-*
 * 텍스트 색 상속(stroke=currentColor)을 유지한다.
 */
export const iconProps = {
  size: 16,
  strokeWidth: 2,
  absoluteStrokeWidth: false,
  color: "currentColor",
  "aria-hidden": true,
  style: { color: "inherit", height: 16, width: 16 },
} as const satisfies LucideProps;
