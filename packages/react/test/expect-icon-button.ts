import { expect } from "vitest";

/**
 * icon-only 버튼 계약을 단언한다: accessible name과 동일한 title,
 * 텍스트 없는 콘텐츠, 16px로 고정된 aria-hidden lucide svg 아이콘.
 * iconClass는 lucide가 아이콘마다 부여하는 식별 클래스(예: "lucide-bold")로,
 * 어떤 아이콘이 렌더됐는지(identity)를 고정한다.
 */
export const expectIconOnlyButton = (
  button: HTMLElement,
  label: string,
  iconClass: string,
) => {
  expect(button.getAttribute("title")).toBe(label);
  expect(button.textContent).toBe("");
  const icon = button.querySelector("svg");
  if (icon == null) throw new Error(`${label} 버튼에 svg 아이콘이 없다`);
  expect(icon.getAttribute("aria-hidden")).toBe("true");
  expect(icon.classList.contains(iconClass)).toBe(true);
  expect(icon.getAttribute("width")).toBe("16");
  expect(icon.getAttribute("height")).toBe("16");
  // inline style은 소비자 전역 CSS(.lucide, svg 셀렉터)가 presentation
  // attribute를 이겨 크기를 바꾸는 것을 막는 방어다.
  expect(icon.style.width).toBe("16px");
  expect(icon.style.height).toBe("16px");
};
