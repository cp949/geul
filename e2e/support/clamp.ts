/**
 * 클램프 e2e(PIT-0011)가 뷰포트 경계를 확인할 때 쓰는 공통 여백 상수.
 * 스펙 파일마다 -4/-2/무허용(0)으로 갈라져 있던 값을 여기로 모은다(#44 항목 4).
 */

/**
 * `useClampedMenuPosition`이 보장하는 뷰포트 여백(px) — 훅의
 * `MENU_VIEWPORT_MARGIN` 사본이다. 훅은 이 값을 export하지 않으므로
 * (#44 항목 2에서 공개 표면을 `style` 하나로 줄였다) e2e가 따로 적는다.
 * 훅 쪽 값이 바뀌면 여기도 같이 바꾼다.
 */
const CLAMP_VIEWPORT_MARGIN_PX = 8;

/**
 * 보장 여백을 그대로(`>= 8`) assert하면 서브픽셀 반올림·브라우저별 렌더링
 * 차이로 경계값에서 흔들린다(PIT-0011). 그만큼 느슨하게 본다.
 *
 * 값 4는 #44 이전 스펙들이 쓰던 값(-4/-2/무허용 0) 중 가장 엄격한 것이다 —
 * block-handle·slash-menu·table-format의 세로축이 마이그레이션 때부터 써온
 * 4를 그대로 채택했고(#43~#44), 무허용(0)이던 formatting-toolbar와
 * table-format 상단 셀 케이스는 그만큼 강화됐다. 실측(2026-08-19, chromium
 * headless, 8개 PIT-0011 세로축 경계 시나리오를 3회 반복)에서 전부 정확히
 * margin=8이었다(표 상단 셀 케이스만 66으로 훨씬 여유 있음) — 어느 파일의
 * assertion도 느슨해지지 않는다.
 *
 * 가로축까지 통일하며 다시 잰 값에서는 정수가 아닌 경계가 나왔다 —
 * LinkToolbar view 모드 오른쪽 끝이 900px 뷰포트에서 891.9921875(margin
 * 8.0078)다. 서브픽셀 여지는 실재하므로 경계값 8을 그대로 요구하지 않는다.
 */
const CLAMP_BOUNDARY_TOLERANCE_PX = 4;

/**
 * 클램프 e2e가 요구하는 최소 여백(px) = 보장 여백 - 허용오차.
 * 뷰포트 어느 변에서든 오버레이 박스가 이만큼은 안쪽에 있어야 한다.
 * 상단·좌측은 `>= CLAMP_BOUNDARY_MIN_MARGIN_PX`로, 하단·우측은
 * `<= 뷰포트 크기 - CLAMP_BOUNDARY_MIN_MARGIN_PX`로 확인한다.
 */
export const CLAMP_BOUNDARY_MIN_MARGIN_PX =
  CLAMP_VIEWPORT_MARGIN_PX - CLAMP_BOUNDARY_TOLERANCE_PX;
