// `emphasis · strong[emphasis] · emphasis` 샌드위치를 `emphasis[…, strong[…], …]`로 끌어올린다(Issue #415).
//
// 필요한 이유:
// - bold 런 뒤에 italic · bold·italic · italic 런이 이어지면 mdast는 strong, emphasis, strong[emphasis], emphasis가 된다.
// - 앞 strong이 구두점으로 끝나면 `mdast-util-to-markdown@2.2.0`이 `**.***a****a****1*`을 낸다.
// - 구분자 `*`이 연달아 붙어 재가져오기에서 닫는 구분자가 글자로 샌다.
// - 왕복이 맞는 구분자 조합은 있다. 라이브러리의 serialize/improve 탐욕 탐색이 `***` 연쇄를 못 풀 뿐이다.
// - 라이브러리 버전은 2.2.0이 최신이라 패치를 기다릴 수 없다.
// - 샌드위치를 emphasis 하나로 감싸면 라이브러리가 푸는 모양이 된다. 글자와 mark 범위는 그대로다.
//
// 적용 조건(모두 만족해야 한다):
// - 인접 형제가 emphasis, strong(자식이 emphasis 정확히 하나), emphasis 순서다.
// - 이 emphasis 바로 앞 형제가 strong이다.
// - 앞 strong의 끝 글자가 구두점이거나 head emphasis의 첫 글자가 구두점이다. 한쪽이면 된다.
//   - 둘 다 영숫자 경계면 수정 전 출력(`**a***a*__*a*__*1*`)이 이미 맞아서 건드리지 않는다.
//   - 앞 strong이 영숫자로 끝나도 head가 구두점으로 시작하면 `**a***.a****a****a*`로 나가 같은 결함이다.
//   - 첫 샌드위치를 끌어올리면 뒤 샌드위치의 구분자 배치가 바뀐다. 뒤 샌드위치가 그 모양이면 head 조건이 없을 때 깨진다.
// - 구두점 판정은 가장자리 잎 기준이다. 끝 글자는 마지막 잎, 첫 글자는 첫 잎이다.
//   - `text`는 가장자리 코드 포인트가 `/[\p{P}\p{S}\s]/u`에 맞을 때다.
//     micromark `classifyCharacter`가 공백(1)·구두점(2)으로 분류하는 글자와 같다.
//     io의 직접 의존이 아니라서 정규식으로 옮겼다.
//   - `inlineCode`는 백틱이 가장자리 글자라서 항상 참이다.
//   - `html`은 값의 가장자리 글자로 판정한다. 표 셀 개행 `<br>`는 양끝이 `<`·`>`다.
//   - 노드의 가장자리 자식이 `delete`이고 가장자리 잎 text가 비어 있지 않으면 참이다.
//     `strong[delete[a]]`의 실제 직전 글자는 닫는 `~~`다. 잎 글자가 영숫자여도 같은 결함이 난다.
//     delete가 emphasis 안에 있으면(`strong[emphasis[delete[a]]]`) 적용하지 않는다. 그 모양은 끌어올리지 않아도 왕복이 맞는다.
//   - `break` 등 그 밖의 잎과 값이 없는 text는 거짓이다. 가장자리 글자를 알 수 없다.
// - 앞 strong, head, strong, tail, 뒤 형제 어디에도 astral 글자(U+10000 이상)가 없다. 있으면 끌어올리지 않는다.
//   - 끌어올리면 astral 글자가 구분자 옆에 놓여 문자 참조(`&#x1F600;`)로 나간다.
//   - 그 옆 `_`는 이스케이프되지 않는다(#414). 수정 전에는 왕복이 맞던 입력이 깨진다.
//   - 끌어올리지 않으면 수정 전과 같은 출력이다. #414가 고쳐지면 이 조건을 뺄 수 있다.

// 고정점 반복:
// - 끌어올린 emphasis 뒤에 `strong[emphasis] · emphasis`가 이어지면 새 샌드위치가 생긴다.
// - 한 번만 끌어올리면 `**.***a.**a**a****.****a*`처럼 `****` 연쇄가 남는다.
// - 변화가 없을 때까지 패스를 반복한다. 한 번 끌어올릴 때마다 노드가 둘 줄어 반드시 끝난다.
//
// 왜 조건을 거는가:
// - 아래 수치는 모두 글자 한 개짜리 런으로 만든 전수 입력 공간 기준이다. 입력은 런 N·B·I·X(mark 없음·bold·italic·bold·italic)를 이은 것이다.
//   - 길이 1~4, 글자 `a`·`.`·`_`, 인접 같은 종류 제외(9,840건): 실패 6건은 이 조건에만 있었다.
//   - 앞 strong이 구두점으로 끝나는 조건만 걸면 출력 변경이 108건이다. head 구두점 시작을 더하면 144건이다(왕복이 이미 맞던 138건 + 수정 전 실패 6건).
//   - 조건 없이 한 번 걸면 513건이고 영숫자로 끝나는 입력도 바뀐다.
//   - 영숫자 경계 입력의 출력(`**a***a*__*a*__*1*`)은 바뀌지 않는다.
//   - strike 포함 길이 4, 글자 `a`·`.`, mark 종류 8(N·B·I·X와 각각의 strike, 43,904건): delete 규칙이 실패 4건을 0으로 만든다. 출력 변경은 64건이다.
//   - 코드 포함 길이 4, 글자 `a`·`.`, mark 종류 8(N·B·I·X와 각각의 code, 43,904건): inlineCode 규칙이 실패 8건을 0으로 만든다. 출력 변경은 256건이다.
//   - 표 셀 길이 4, 글자 `a`·`.`·`a\n`·`.\n`, N·B·I·X(27,648건): html 규칙이 실패 16건을 0으로 만든다. 출력 변경은 256건이다.
//   - 위 세 줄의 출력 변경 건수는 앞 strong 끝 조건만 건 기준이다. head 시작 조건을 더하면 더 늘어난다.
//   - 끌어올린 출력은 글자가 문자 참조(`&#x61;`)로 나갈 수 있다. 유효하고 왕복은 같다.
// - 한계: 앞 strong이 없거나 영숫자 경계인 겹친 샌드위치는 조건 밖이고 깨진 채 남는다. 별도 이슈(#416)다.
//   - 앞 strong 없이 시작하는 `I X I X I`는 `*.****a****a****a****a*`로 나간다.
//   - 앞 strong은 있으나 끝이 영숫자이고 head도 영숫자로 시작하는 `X B I X I`(첫 글자 `.`)는 `***.*&#x61;***a****a****a*`로 나간다.
//     마지막 잎이 영숫자라도 실제 직전 글자는 문자 참조 끝 `;`다.
//   - 길이 5(`a`·`.`·`_`, 88,572건)는 12건, 길이 6(`a`·`.`, 74,648건)은 46건, 길이 7은 398건이 남는다.
//   - astral 글자가 든 샌드위치는 위 가드가 끌어올리지 않아 #414 때문에 수정 전처럼 깨진 채 남는다.
//   - 가설: 끌어올린 앞부분 때문에 astral이 든 뒷부분 샌드위치의 구분자 배치가 바뀌어 깨질 수 있다. astral·`_`가 많은 무작위 입력 20만 건 중 10건이 이 모양이다.

// 퇴행 조사 입력 공간(G-PRC-002):
// - 공통: 수정 전(6cadd4aa)과 수정 후를 비교했다. 판정은 strict 내보내기 뒤 재가져온 글자·mark가 원본과 같은지다.
//   수정 전에 맞던 입력이 수정 후 깨지는 경우는 아래 전수 10개 공간에서 모두 0건이다.
// - 전수: 런마다 글자 하나 이상(아래 글자 집합)과 mark 종류 하나를 고른다. 인접 같은 종류는 제외한다. 개행 글자 런은 예외다.
//   병렬 10개를 합쳐 600초 넘게 걸렸다. 호스트 p는 문단, t는 표 셀이다.
//   | 호스트 | 최대 런 수 | 글자 | mark 종류 | 건수 |
//   | p | 4 | `a` `.` `_` | N B I X | 9,840 |
//   | p | 5 | `a` `.` `_` | N B I X | 88,572 |
//   | p | 6 | `a` `.` | N B I X | 74,648 |
//   | p | 7 | `a` `.` | N B I X | 447,896 |
//   | p | 4 | `a` `.` | N B I X S BS IS XS | 47,280 |
//   | p | 4 | `a` `.` | N B I X C BC IC XC | 47,280 |
//   | t | 4 | `a` `.` `a\n` `.\n` | N B I X | 47,280 |
//   | p | 4 | `ab` `.a` `a.` `a_` `한` `😀` | N B I X | 148,200 |
//   | p | 4 | `a` `.` `_` `😀` `!` | N B I X | 72,320 |
//   | p | 4 | `.` `a` `😀` | 위 S계 4종 + C계 4종 + N B I X | 1,334,160 |
//   mark 약어는 N(mark 없음), B(bold), I(italic), X(bold·italic), S(strike), C(code)이고 `BS`는 bold·strike다.
//   영숫자 경계와 구두점 경계, 문자 참조, astral 경계를 나눠 덮도록 글자를 골랐다.
// - 무작위: 4개를 병렬로 돌렸고 580초 안에 끝났다. 각 20만 건이다. 호스트는 문단 75%, 표 셀 25%다. 런 글자는 집합에서 1~3개를 이은 것이다.
//   mark 종류는 N B I X S BS IS XS C BC IC XC L BL IL XL(L은 link) 16종이다.
//   - 샌드위치 편향: 앞 런 하나 뒤에 I X I를 1~3번 반복한다. 각 자리는 15% 확률로 다른 종류가 된다.
//     글자 `a` `.` `_` `!` `a.`: 수정 후 깨짐 0건, 수정 전 실패가 고쳐진 입력 4,247건.
//     글자 `a` `.` `_` `😀` `!` `ab_😀`: 퇴행 10건. 모두 astral이 든 뒤쪽 샌드위치가 가드로 남아 앞 샌드위치 끌어올림과 어긋난 모양이다(런 7개 이상).
//   - 균등: 런 2~10개이고 종류는 4·8·16종 중 하나에서 고른다.
//     글자 `a` `.` `_` `!` `a.`, 글자 `a` `.` `_` `한` `!` `𝐚`: 퇴행 0건.
//
// 함정:
// - `mergeAdjacentInline` 뒤에 적용한다. 병합이 끝나야 샌드위치 모양이 나타난다.
// - `mergeAdjacentText` 앞에 적용한다. 끌어올린 뒤 자식 사이에 인접 text가 생길 수 있다.
// - 입력 노드를 변경하지 않는다. inlineNodes의 호출자가 같은 배열을 다시 쓸 수 있다.
// - 빈 `children` 배열, 빈 값 text에서 던지지 않는다. 적용하지 않고 지나간다.

type InlineNode<T> = {
  type: string;
  value?: string;
  children?: T[];
};

type Side = "start" | "end";

const SPACE_OR_PUNCTUATION = /[\p{P}\p{S}\s]/u;
const ASTRAL = /[\u{10000}-\u{10FFFF}]/u;

/**
 * 노드 가장자리 자식을 돌려준다. 없으면 undefined다.
 */
const edgeChild = <T extends InlineNode<T>>(
  node: T,
  side: Side,
): T | undefined => {
  const children = node.children;
  if (children === undefined) return undefined;
  return side === "end" ? children[children.length - 1] : children[0];
};

/**
 * 노드의 가장자리 잎을 찾는다. 자식이 없거나 빈 배열이면 그 노드가 잎이다.
 */
const edgeLeaf = <T extends InlineNode<T>>(node: T, side: Side): T => {
  let current = node;
  for (;;) {
    const next = edgeChild(current, side);
    if (next === undefined) return current;
    current = next;
  }
};

/**
 * 값의 가장자리 코드 포인트가 구두점·기호·공백인지 판정한다. 빈 값이면 거짓이다.
 */
const edgeCharacterIsPunctuation = (value: string, side: Side): boolean => {
  const codePoints = [...value];
  const codePoint = side === "end" ? codePoints.pop() : codePoints[0];
  return codePoint !== undefined && SPACE_OR_PUNCTUATION.test(codePoint);
};

/**
 * 노드의 가장자리 글자가 구두점·기호·공백이거나 구분자인지 판정한다.
 * `end`는 끝 글자, `start`는 첫 글자다.
 * - 가장자리 잎이 `inlineCode`이면 백틱이 가장자리 글자라서 참이다.
 * - 가장자리 잎이 `html`이면 값의 가장자리 글자로 판정한다. 표 셀 `<br>`는 `>`와 `<`다.
 * - 가장자리 자식이 `delete`이고 잎 text가 비어 있지 않으면 `~~`가 가장자리 글자라서 참이다.
 * - 그 밖에 `text`가 아닌 잎(`break` 등)이나 값이 없는 text는 거짓이다.
 */
const edgeIsPunctuation = <T extends InlineNode<T>>(
  node: T,
  side: Side,
): boolean => {
  const leaf = edgeLeaf(node, side);
  if (leaf.type === "inlineCode") return true;
  if (leaf.value === undefined) return false;
  if (leaf.type === "html") return edgeCharacterIsPunctuation(leaf.value, side);
  if (leaf.type !== "text") return false;
  if (leaf.value.length > 0 && edgeChild(node, side)?.type === "delete") {
    return true;
  }
  return edgeCharacterIsPunctuation(leaf.value, side);
};

/**
 * 노드 안에 astral 글자(U+10000 이상)가 있는지 판정한다.
 */
const hasAstralCodePoint = <T extends InlineNode<T>>(node: T): boolean =>
  (node.value !== undefined && ASTRAL.test(node.value)) ||
  (node.children?.some(hasAstralCodePoint) ?? false);

/**
 * 자식이 emphasis 정확히 하나인 strong인지 판정한다.
 */
const isStrongOfOneEmphasis = <T extends InlineNode<T>>(node: T): boolean =>
  node.type === "strong" &&
  node.children?.length === 1 &&
  node.children[0]?.type === "emphasis";

/**
 * 샌드위치 세 노드를 emphasis 하나로 감싼 새 노드를 만든다.
 * 가운데 strong은 emphasis 자식을 풀어 그 자식들을 품는다.
 */
const liftSandwich = <T extends InlineNode<T>>(
  head: T,
  strong: T,
  tail: T,
): T => {
  const inner = strong.children?.[0]?.children ?? [];
  return {
    ...head,
    children: [
      ...(head.children ?? []),
      { ...strong, children: inner },
      ...(tail.children ?? []),
    ],
  };
};

type LiftResult<T> = { nodes: T[]; changed: boolean };

/**
 * 샌드위치를 한 번 끌어올린 결과를 돌려준다. 자식에도 재귀로 적용한다.
 * 끌어올린 노드가 있으면 `changed`가 참이다.
 */
const liftOnce = <T extends InlineNode<T>>(
  nodes: readonly T[],
): LiftResult<T> => {
  let changed = false;
  const recursed = nodes.map((node) => {
    if (node.children === undefined) return node;
    const result = liftOnce(node.children);
    if (!result.changed) return node;
    changed = true;
    return { ...node, children: result.nodes };
  });
  const lifted: T[] = [];
  for (let index = 0; index < recursed.length; index++) {
    const previous = recursed[index - 1];
    const head = recursed[index];
    const middle = recursed[index + 1];
    const tail = recursed[index + 2];
    if (
      previous !== undefined &&
      head !== undefined &&
      middle !== undefined &&
      tail !== undefined &&
      previous.type === "strong" &&
      head.type === "emphasis" &&
      isStrongOfOneEmphasis(middle) &&
      tail.type === "emphasis" &&
      (edgeIsPunctuation(previous, "end") ||
        edgeIsPunctuation(head, "start")) &&
      ![previous, head, middle, tail, recursed[index + 3]].some(
        (node) => node !== undefined && hasAstralCodePoint(node),
      )
    ) {
      lifted.push(liftSandwich(head, middle, tail));
      changed = true;
      index += 2;
    } else if (head !== undefined) {
      lifted.push(head);
    }
  }
  return { nodes: lifted, changed };
};

/**
 * 샌드위치를 끌어올린 새 배열을 돌려준다. 자식에도 재귀로 적용한다.
 * 변화가 없을 때까지 반복한다. 끌어올린 emphasis 뒤에 `strong[emphasis] · emphasis`가
 * 이어지면 새 샌드위치가 생기기 때문이다. 한 번 끌어올릴 때마다 노드가 둘 줄어 반드시 끝난다.
 */
export const liftEmphasisSandwich = <T extends InlineNode<T>>(
  nodes: readonly T[],
): T[] => {
  let result: LiftResult<T> = { nodes: [...nodes], changed: false };
  do {
    result = liftOnce(result.nodes);
  } while (result.changed);
  return result.nodes;
};
