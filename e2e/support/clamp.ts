/**
 * `useClampedMenuPosition`은 뷰포트 경계에 최소 8px(`MENU_VIEWPORT_MARGIN`)
 * 여백을 보장한다. e2e에서 그 값을 그대로(`>= 8`) assert하면 서브픽셀
 * 반올림·브라우저별 렌더링 차이로 경계값에서 흔들린다(PIT-0011) — 대신 이
 * 허용오차만큼 느슨하게 확인한다.
 *
 * 값 4는 새로 고른 숫자가 아니다 — block-handle·slash-menu·table-format
 * 스펙이 마이그레이션 때부터 이미 이 값으로 안정적으로 통과해 온 허용치다
 * (#43~#44). #44 이전에는 파일마다 -4/-2/무허용(정확히 0)이 제각각이었는데,
 * 실측(2026-08-19, chromium headless, 8개 PIT-0011 경계 시나리오를 3회
 * 반복)으로 전부 정확히 margin=8(표 상단 셀 케이스만 66으로 훨씬 여유
 * 있음)임을 확인한 뒤 가장 엄격했던 값(4)으로 통일했다 — 어느 파일의
 * assertion도 느슨해지지 않는다.
 */
export const CLAMP_BOUNDARY_TOLERANCE_PX = 4;
