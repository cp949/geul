import {
  type InlineContent,
  sanitizeInlineText,
  type TextMark,
} from "@cp949/geul-model";

import type { HtmlNode } from "../html/inline-content.js";

// HTML whitespace(TAB/LF/FF/CR/SPACE) run. ProseMirror DOM 파서가
// preserveWhitespace:false에서 접는 집합과 같다(NBSP는 포함하지 않는다).
const HTML_WHITESPACE_RUN = /[\t\n\f\r ]+/g;

// model의 인라인 텍스트 계약(isValidInlineText)이 금지하는 코드 포인트
// 제거는 model의 sanitizeInlineText가 단독 소유한다(G-CNV-001) — 클립보드
// 셀 텍스트 전용 정책(공백 run 접기)만 여기서 얹는다.
export const sanitizeCellText = (text: string): string =>
  sanitizeInlineText(text);

// hast 텍스트 노드 단계에서 whitespace를 접는다. inlineContentFromNodes가
// br을 LF로 바꾸기 전에 접어야 "원본 마크업 들여쓰기가 만든 개행"과
// "br이 만든 줄바꿈"을 구분할 수 있다.
export const collapseHtmlWhitespace = (nodes: HtmlNode[]): void => {
  for (const node of nodes) {
    if (node.type === "text") {
      node.value = sanitizeCellText(
        node.value.replace(HTML_WHITESPACE_RUN, " "),
      );
      continue;
    }
    if (node.type === "element") collapseHtmlWhitespace(node.children);
  }
};

const marksKey = (marks: TextMark[] | undefined): string =>
  JSON.stringify(marks ?? []);

// 남은 공백 run을 하나로 줄이고 셀 앞뒤 공백과 LF에 붙은 공백을 버린다.
// 세그먼트 경계를 넘어 이어진 공백까지 접어야 하므로 전체 텍스트를 한 번
// 이어붙인 뒤 유지할 코드 유닛을 정한다.
const keptCodeUnits = (flat: string): boolean[] => {
  const kept = new Array<boolean>(flat.length).fill(true);
  let lastKept = "";
  let index = 0;

  while (index < flat.length) {
    const character = flat[index];
    if (character !== " ") {
      lastKept = character ?? "";
      index += 1;
      continue;
    }

    // 공백 run의 끝을 run마다 한 번만 찾는다. run 안의 인덱스마다 다시
    // 훑으면 긴 공백 run에서 O(n^2)가 된다.
    let runEnd = index;
    while (flat[runEnd] === " ") runEnd += 1;
    const follower = flat[runEnd];

    // 셀 앞머리, LF 뒤, 셀 끝, LF 앞의 공백 run은 통째로 버리고, 그 밖의
    // run은 첫 칸만 남겨 공백 하나로 접는다.
    const dropWholeRun =
      lastKept === "" ||
      lastKept === "\n" ||
      follower === undefined ||
      follower === "\n";
    for (
      let drop = dropWholeRun ? index : index + 1;
      drop < runEnd;
      drop += 1
    ) {
      kept[drop] = false;
    }
    if (dropWholeRun) kept[index] = false;
    else lastKept = " ";

    index = runEnd;
  }

  return kept;
};

export const normalizeCellContent = (content: InlineContent): InlineContent => {
  const kept = keptCodeUnits(content.map((item) => item.text).join(""));
  const normalized: InlineContent = [];
  let offset = 0;

  for (const item of content) {
    let text = "";
    for (let index = 0; index < item.text.length; index += 1) {
      if (kept[offset + index] === true) text += item.text[index];
    }
    offset += item.text.length;
    if (text.length === 0) continue;

    // 빈 세그먼트가 사라지면서 같은 mark 조합이 이웃하게 될 수 있다 —
    // inlineContentFromNodes와 같은 병합 형태를 유지한다.
    const previous = normalized.at(-1);
    if (
      previous !== undefined &&
      marksKey(previous.marks) === marksKey(item.marks)
    ) {
      previous.text += text;
      continue;
    }
    normalized.push(
      item.marks === undefined ? { text } : { text, marks: item.marks },
    );
  }

  return normalized;
};
