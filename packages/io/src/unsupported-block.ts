// 임시 — quote·divider 실제 매핑(HTML/GFM)이 들어오면 제거한다.
//
// `Block` union에 quote·divider가 들어왔지만(DELTA-01) exportHtml·exportMarkdown의
// 매핑은 아직 없다(DELTA-06·06a·07·07a). 그 사이 두 exporter가 `hundefined`
// 태그나 TypeError 같은 손상 대신 구조화된 `Result` 실패로 명시 거절할 수
// 있도록, 문서 안에서 첫 quote/divider 블록을 찾아 주는 helper다. 새 검증
// 규칙이 아니다 — model `parseDocument`가 통과시킨 문서를 타입 기준으로만
// 훑는다(G-CNV-001). `io/src/index.ts`에서 export하지 않는다(공개 표면 불변).
import type { Block } from "@cp949/geul-model";

export type UnsupportedBlock = { id: string; type: "quote" | "divider" };

// 문서 순서(pre-order)로 children까지 재귀 탐색해 첫 quote/divider 블록을
// 돌려준다. quote 자신이 children을 가져도 quote를 먼저 보고한다.
export const findUnsupportedBlock = (
  blocks: readonly Block[],
): UnsupportedBlock | undefined => {
  for (const block of blocks) {
    if (block.type === "quote" || block.type === "divider") {
      return { id: block.id, type: block.type };
    }
    if (block.type === "table") continue;
    if (block.children !== undefined) {
      const nested = findUnsupportedBlock(block.children);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
};
