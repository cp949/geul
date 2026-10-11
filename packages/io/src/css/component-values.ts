// 토큰 목록을 component value로 묶는다(CSS Syntax Level 3 §5).
// - 함수 토큰과 `(`·`[`·`{`가 연다. 짝 맞는 닫는 토큰만 닫는다. `[)`의 `)`는
//   `[` 블록 안의 보통 토큰이다. 연 것이 없을 때의 닫는 토큰도 보통 토큰이다.
// - 입력 끝에서 열린 함수·블록은 모두 닫는다. Chromium도 입력 끝에서 닫는다
//   (`color:rgb(255,0,0`는 빨강).
// - 주석 토큰은 버린다.
// - 재귀하지 않는다. 깊은 중첩에서도 호출 스택이 넘치지 않는다.
import type { CssToken } from "./tokens.js";

type Closer = ")" | "]" | "}";

export type CssPreservedToken = Exclude<
  CssToken,
  { type: "function" | "(" | "[" | "{" | "comment" }
>;

export type CssFunction = {
  type: "function";
  // 이스케이프를 푼 함수 이름이다. `(`는 없다.
  name: string;
  value: CssComponentValue[];
  // 짝 맞는 `)`로 닫혔는지다. 입력 끝에서 닫혔으면 false다.
  closed: boolean;
  start: number;
  end: number;
};

export type CssBlock = {
  type: "block";
  open: "(" | "[" | "{";
  value: CssComponentValue[];
  closed: boolean;
  start: number;
  end: number;
};

export type CssComponentValue = CssPreservedToken | CssFunction | CssBlock;

const CLOSER_OF = { "(": ")", "[": "]", "{": "}" } as const;

type Frame = {
  node: CssFunction | CssBlock;
  closer: Closer;
  parent: CssComponentValue[];
};

/**
 * `tokens[from]`부터 `tokens[to]` 앞까지를 component value 목록으로 묶는다.
 */
export const parseCssComponentValues = (
  tokens: readonly CssToken[],
  from = 0,
  to = tokens.length,
): CssComponentValue[] => {
  const root: CssComponentValue[] = [];
  const stack: Frame[] = [];
  let current = root;
  let lastEnd = 0;

  const open = (node: CssFunction | CssBlock, closer: Closer): void => {
    current.push(node);
    stack.push({ node, closer, parent: current });
    current = node.value;
  };

  for (let index = from; index < to; index += 1) {
    const token = tokens[index] as CssToken;
    lastEnd = token.end;
    if (token.type === "comment") continue;

    const top = stack[stack.length - 1];
    if (top !== undefined && token.type === top.closer) {
      top.node.closed = true;
      top.node.end = token.end;
      stack.pop();
      current = top.parent;
      continue;
    }

    if (token.type === "function") {
      open(
        {
          type: "function",
          name: token.value,
          value: [],
          closed: false,
          start: token.start,
          end: token.end,
        },
        ")",
      );
    } else if (token.type === "(" || token.type === "[" || token.type === "{") {
      open(
        {
          type: "block",
          open: token.type,
          value: [],
          closed: false,
          start: token.start,
          end: token.end,
        },
        CLOSER_OF[token.type],
      );
    } else {
      current.push(token);
    }
  }

  // 입력 끝에서 닫는다. 끝 위치는 마지막 토큰의 끝이다.
  for (const frame of stack) frame.node.end = lastEnd;
  return root;
};
