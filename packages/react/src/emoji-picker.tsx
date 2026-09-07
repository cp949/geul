import type { EmojiOption } from "./emoji-picker-options.js";

export type { EmojiOption };

/**
 * `:query` 캐럿-텍스트 트리거 감지. `slash-menu.tsx`의 `parseSlashQuery`와
 * 동일한 방식(블록 텍스트 전체가 트리거와 정확히 일치할 때만 연다)을 독자
 * 구현한다 — 두 파일이 서로 다른 트리거 문자(`/` vs `:`)와 필터링 대상을
 * 다뤄 공유 훅으로 추출하지 않는다(저장소 관례, `media-toolbar.tsx`/
 * `file-panel.tsx`의 "사용처 2곳뿐이라 훅 추출 이득이 적다" 전례와 동일 근거,
 * RD-004.md "포함 범위" 참고).
 *
 * 블록 텍스트 전체 매치로 제한하는 이유는 필터링뿐 아니라 선택 시 삽입
 * 방식과도 맞물린다 — core에는 캐럿 앞 트리거 부분 문자열만 골라 치환하는
 * 오프셋 기반 공개 API가 없다(`editor-controller-types.ts`의 `commands`
 * 전체를 조사한 결과, `setText`는 블록 콘텐츠 전체를 갈아치우는 API고
 * `setTextCursorPosition`은 "start"/"end" 두 값만 받는다). 트리거가 블록
 * 텍스트 전체와 같으면 선택 시 `commands.setText(blockId, char)`로 블록을
 * 통째로 이모지 한 글자로 바꾸고 `commands.setTextCursorPosition(blockId,
 * "end")`로 캐럿을 이모지 뒤에 놓을 수 있다 — 부분 문자열 오프셋 계산이
 * 전혀 필요 없어진다(DELTA-02에서 이 삽입 로직을 구현할 때 그대로 재사용).
 */
export const parseEmojiQuery = (text: string): string | null => {
  const match = /^:(\S*)$/.exec(text);
  return match === null ? null : (match[1] ?? "");
};

const matchesEmojiQuery = (option: EmojiOption, query: string): boolean => {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return (
    option.label.toLowerCase().includes(needle) ||
    option.keywords.some((keyword) => keyword.startsWith(needle))
  );
};

/**
 * `slash-menu.tsx`의 `filterItems`와 같은 자리 — label 부분 일치 또는
 * keyword 접두 일치. emoji는 `SlashMenuItem`과 달리 소스 블록 타입에 따라
 * 후보 집합이 달라지지 않아(`filterItems(source, query, ...)`의 `source`에
 * 대응하는 매개변수가 없다) 옵션 배열과 쿼리만 받는다.
 */
export const filterEmojiOptions = (
  options: readonly EmojiOption[],
  query: string,
): EmojiOption[] =>
  options.filter((option) => matchesEmojiQuery(option, query));
