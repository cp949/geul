import { isNestableBlockType } from "./block-kind.js";
import type { DocumentPath } from "./document-validation-helpers.js";
import type { DocumentError } from "./errors.js";
import type { Result } from "./result.js";

// spec §3.2 "조작된 JSON의 재귀 검증 스택 사용을 방어" — 정상 중첩 상한과
// 스택 오버플로 방어를 같은 상수·같은 오류 코드로 묶는다(spec §8, 완료 조건
// 4·6). blocks 배열 자체가 depth 1이다.
export const MAX_NESTING_DEPTH = 64;

// input은 아직 zod로 파싱되지 않은 원시 값이라 형태를 신뢰할 수 없다.
// children 배열만 방어적으로 따라가며 최대 깊이를 센다. depth가 상한을
// 넘는 즉시(더 깊이 들어가지 않고) 반환하므로, 수천 단계로 조작된 children
// 체인이 들어와도 재귀 스택이 상수 깊이(MAX_NESTING_DEPTH + 1) 안에서
// 끝난다 — documentSchema.safeParse보다 먼저 실행해 zod의 재귀 파싱 자체가
// 시작되지 않게 한다(PIT-0034: 결정적 조건, wall-clock 아님).
const findNestingDepthViolation = (
  blocks: unknown,
  depth: number,
  path: DocumentPath,
): DocumentPath | undefined => {
  if (depth > MAX_NESTING_DEPTH) return path;
  if (!Array.isArray(blocks)) return undefined;

  for (const [index, block] of blocks.entries()) {
    if (block === null || typeof block !== "object") continue;
    const { type, children } = block as {
      type?: unknown;
      children?: unknown;
    };
    // schema가 children을 허용하는 블록만 따라간다. table/divider/codeBlock과
    // 알 수 없는 판별자의 children은 strict shape 위반이므로 zod가 원래
    // DOCUMENT_INVALID path에서 판정해야 한다.
    if (typeof type !== "string" || !isNestableBlockType(type)) {
      continue;
    }
    // 빈 children 배열은 "자식 없음"이다 — 다른 층(validateBlocksAt,
    // model-to-tiptap)과 같은 해석. 배열이 아닌 값은 어차피 zod가 거절하므로
    // 깊이 위반으로 오분류하지 않고 그쪽에 맡긴다.
    if (!Array.isArray(children) || children.length === 0) continue;
    const violation = findNestingDepthViolation(children, depth + 1, [
      ...path,
      index,
      "children",
    ]);
    if (violation) return violation;
  }
  return undefined;
};

export const validateNestingDepth = (
  input: unknown,
): Result<undefined, DocumentError> => {
  const blocks =
    input !== null && typeof input === "object" && "blocks" in input
      ? (input as { blocks?: unknown }).blocks
      : undefined;
  const violation = findNestingDepthViolation(blocks, 1, ["blocks"]);
  if (violation) {
    return {
      ok: false,
      error: {
        code: "DOCUMENT_LIMIT_EXCEEDED",
        path: violation,
        message: `Nesting depth exceeds ${MAX_NESTING_DEPTH}`,
      },
    };
  }
  return { ok: true, value: undefined };
};
