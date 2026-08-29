// 임시 — quote·divider GFM 매핑(07·07a)이 들어오면 제거한다.
//
// `Block` union에 quote·divider가 들어왔지만(DELTA-01) 매핑은 경로별로 따로
// 들어온다 — HTML은 divider(<hr>, DELTA-06)·quote(<blockquote>, DELTA-06a)
// 매핑이 모두 들어와 이 helper를 더 이상 부르지 않고, quote·divider GFM
// (07·07a)만 남았다. 그 사이 exportMarkdown이 TypeError 같은 손상 대신
// 구조화된 `Result` 실패로 명시 거절할 수 있도록, 문서 안에서 첫 미지원
// 블록을 찾아 주는 helper다. 어느 타입을 미지원으로 볼지는 호출자가 집합으로
// 넘긴다 — 기본값은 quote·divider 둘 다(GFM 경로가 그대로 쓴다). 새 검증
// 규칙이 아니다 — model `parseDocument`가 통과시킨 문서를 타입 기준으로만
// 훑는다(G-CNV-001). `io/src/index.ts`에서 export하지 않는다(공개 표면 불변).
import type { Block } from "@cp949/geul-model";

export type UnsupportedBlock = { id: string; type: "quote" | "divider" };

const ALL_UNSUPPORTED_BLOCK_TYPES: ReadonlySet<UnsupportedBlock["type"]> =
  new Set(["quote", "divider"]);

// 문서 순서(pre-order)로 children까지 재귀 탐색해 unsupportedTypes에 든 첫
// quote/divider 블록을 돌려준다. quote 자신이 children을 가져도 quote를 먼저
// 보고한다(quote가 집합에 없으면 그 children 안을 계속 본다).
export const findUnsupportedBlock = (
  blocks: readonly Block[],
  unsupportedTypes: ReadonlySet<
    UnsupportedBlock["type"]
  > = ALL_UNSUPPORTED_BLOCK_TYPES,
): UnsupportedBlock | undefined => {
  for (const block of blocks) {
    if (
      (block.type === "quote" || block.type === "divider") &&
      unsupportedTypes.has(block.type)
    ) {
      return { id: block.id, type: block.type };
    }
    if (block.type === "table" || block.type === "divider") continue;
    if (block.children !== undefined) {
      const nested = findUnsupportedBlock(block.children, unsupportedTypes);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
};
