import { LucideProvider } from "lucide-react";
import type {
  ComponentPropsWithoutRef,
  MouseEventHandler,
  ReactElement,
} from "react";

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
 * - mousedown이 contenteditable 초점을 훔치지 않는다는 오버레이 시스템
 *   전체의 불변식을 preserveFocusOnMouseDown으로 기본 강제한다 — 예전에는
 *   22곳의 모든 호출부가 onMouseDown={(e) => e.preventDefault()}를 각자
 *   재선언했다(4차 아키텍처 리뷰 카드 4).
 */

const baseClassName = "geul-icon-button";

/**
 * mousedown의 기본 동작(대상에 초점 이동)을 막은 뒤, 소비자가 onMouseDown을
 * 넘겼으면 그대로 위임한다 — 조용히 버리지 않는다. MenuItemButton도 같은
 * 헬퍼를 써서 이 불변식이 두 컴포넌트에 따로 복제되지 않게 한다.
 */
export const preserveFocusOnMouseDown =
  (
    onMouseDown?: MouseEventHandler<HTMLButtonElement>,
  ): MouseEventHandler<HTMLButtonElement> =>
  (event) => {
    event.preventDefault();
    onMouseDown?.(event);
  };

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
  onMouseDown,
  ...rest
}: IconButtonProps) => (
  <button
    aria-label={label}
    className={`${baseClassName} ${className}`}
    onMouseDown={preserveFocusOnMouseDown(onMouseDown)}
    title={label}
    type="button"
    {...rest}
  >
    <LucideProvider>{icon}</LucideProvider>
  </button>
);
