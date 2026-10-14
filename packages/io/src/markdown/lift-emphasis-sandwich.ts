// `emphasis · strong[emphasis] · emphasis` 샌드위치를 `emphasis[…, strong[…], …]`로 끌어올린다(Issue #415, #416).
//
// 필요한 이유:
// - bold·italic 런이 이어지면 mdast는 emphasis, strong[emphasis], emphasis가 나란히 놓인다.
// - 그대로 직렬화하면 `mdast-util-to-markdown@2.2.0`이 구분자 `*`를 연달아 붙인다.
//   - 예: `*.****a****a****a****a*`, `***.*&#x61;***a****a****a*`.
// - 재가져오기에서 닫는 구분자가 글자로 샌다. 글자와 mark가 달라진다.
// - 왕복이 맞는 구분자 조합은 있다. 라이브러리의 serialize/improve 탐욕 탐색이 `***` 연쇄를 못 풀 뿐이다.
// - 라이브러리 버전은 2.2.0이 최신이라 패치를 기다릴 수 없다.
// - 샌드위치를 emphasis 하나로 감싸면 라이브러리가 푸는 모양이 된다. 글자와 mark 범위는 그대로다.
//
// 적용 조건(모두 만족해야 한다):
// - 인접 형제가 emphasis, strong(자식이 emphasis 정확히 하나), emphasis 순서다. 모양만 본다.
//   - 앞 형제의 유무·종류와 경계 글자는 보지 않는다.
//   - 앞 형제가 없거나 strong이 아니거나 영숫자로 끝나도 끌어올린다.
//   - 경계 글자로 거르면 걸러진 쪽에 깨지는 입력이 남는다. 구두점 판정이 라이브러리 동작을 흉내 내야 한다(#415).
// - 앞 형제, head, strong, tail, 뒤 형제 어디에도 astral 글자(U+10000 이상)가 없다. 있으면 끌어올리지 않는다.
//   - 끌어올리면 astral 글자가 구분자 옆에 놓여 문자 참조(`&#x1F600;`)로 나간다.
//   - 그 옆 `_`는 이스케이프되지 않는다(#414). 수정 전에는 왕복이 맞던 입력이 깨진다.
//   - 끌어올리지 않으면 수정 전과 같은 출력이다. #414가 고쳐지면 이 조건을 뺄 수 있다.
//   - 가드 창 밖의 astral은 보지 않는다. 앞쪽을 끌어올리면 astral이 든 뒤쪽 샌드위치의 구분자 배치가 바뀌어 깨질 수 있다.
//
// 고정점 반복:
// - 끌어올린 emphasis 뒤에 `strong[emphasis] · emphasis`가 이어지면 새 샌드위치가 생긴다.
// - 한 번만 끌어올리면 `**.***a.**a**a****.****a*`처럼 `****` 연쇄가 남는다.
// - 변화가 없을 때까지 패스를 반복한다. 한 번 끌어올릴 때마다 노드가 둘 줄어 반드시 끝난다.
//
// 규칙의 근거(글자 한 개짜리 런 N·B·I·X의 전수 입력 공간, 수정 전 대비):
// - 길이 5(`a`·`.`·`_`, 88,572건): 실패 12건이 0건이 됐다.
// - 길이 6(`a`·`.`, 74,648건): 실패 46건이 0건이 됐다.
// - 길이 7(`a`·`.`, 447,896건): 실패 398건이 0건이 됐다.
// - 길이 4(글자 8종, 461,600건): 실패 0건이 그대로 0건이다.
// - 퇴행(수정 전에 맞던 입력이 깨짐)은 위 공간에서 0건이다.
// - 출력 문자열이 바뀌는 입력은 4–8%다. 왕복은 같다.
// - 끌어올린 출력은 글자가 문자 참조(`&#x61;`)로 나갈 수 있다. 유효하고 왕복은 같다.
//
// 퇴행 조사 입력 공간(G-PRC-002). #415 조사:
// - 공통: 수정 전(6cadd4aa)과 수정 후를 비교했다. 판정은 strict 내보내기 뒤 재가져온 글자·mark가 원본과 같은지다.
//   수정 전에 맞던 입력이 수정 후 깨지는 경우는 아래 전수 10개 공간에서 모두 0건이다(#415).
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
// #416 조사:
// TODO(main): #416 조사 결과
//
// 함정:
// - `mergeAdjacentInline` 뒤에 적용한다. 병합이 끝나야 샌드위치 모양이 나타난다.
// - `mergeAdjacentText` 앞에 적용한다. 끌어올린 뒤 자식 사이에 인접 text가 생길 수 있다.
// - 입력 노드를 변경하지 않는다. inlineNodes의 호출자가 같은 배열을 다시 쓸 수 있다.
// - 빈 `children` 배열, 빈 값 text에서 던지지 않는다.

type InlineNode<T> = {
  type: string;
  value?: string;
  children?: T[];
};

const ASTRAL = /[\u{10000}-\u{10FFFF}]/u;

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
      head !== undefined &&
      middle !== undefined &&
      tail !== undefined &&
      head.type === "emphasis" &&
      isStrongOfOneEmphasis(middle) &&
      tail.type === "emphasis" &&
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
