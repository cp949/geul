import { LucideProvider } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactElement } from "react";

/**
 * icon-only 버튼의 공통 계약을 한곳에서 강제하는 내부 컴포넌트(index.ts 미수출).
 *
 * - accessible name(aria-label)과 tooltip(title)을 같은 label에서 파생해
 *   두 속성의 drift를 구조적으로 차단한다.
 * - 아이콘 svg를 flex 센터링한다(preflight 부재 환경에서 baseline 정렬로
 *   버튼 높이가 틀어지는 문제 방지).
 * - 빈 LucideProvider로 감싸 소비자 앱의 LucideProvider(className 주입 등)가
 *   geul 내부 아이콘에 전파되지 않게 차단한다. 색·크기·굵기 채널은
 *   iconProps가 명시 prop으로 고정한다.
 */

const baseClassName = "geul-icon-button";

type IconButtonProps = {
  label: string;
  icon: ReactElement;
  className: string;
} & Omit<
  ComponentPropsWithoutRef<"button">,
  "aria-label" | "children" | "className" | "title" | "type"
>;

export const IconButton = ({
  label,
  icon,
  className,
  ...rest
}: IconButtonProps) => (
  <button
    aria-label={label}
    className={`${baseClassName} ${className}`}
    title={label}
    type="button"
    {...rest}
  >
    <LucideProvider>{icon}</LucideProvider>
  </button>
);
