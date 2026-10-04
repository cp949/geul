/**
 * 메뉴·트리거·입력창 keydown의 처리 순서를 한곳에 모은다(Issue #230).
 * 공개 API다. `@cp949/geul-react`는 `handleMenuKeyDown`과 타입
 * `MenuKeyboardEvent`, `MenuKeyboardHandlers`만 내보낸다(Issue #247). 이 파일의
 * 그 밖 이름은 내부다. 소비자가 만드는 트리거 popup도 같은 순서를 쓴다.
 *
 * 순서는 위에서 아래다. 호출부마다 따로 구현하면 순서가 갈라진다.
 * 1. IME 조합 중(`isComposing`): 어떤 키든 처리하지 않고 `false`다.
 *    조합을 확정하는 Enter가 항목 선택으로 새면 안 된다.
 * 2. Escape: `escape`가 있으면 막고 부른다. 수식 키 가드보다 앞이다.
 *    공용 훅의 Escape도 수식 키에서 물러나지 않아 같게 맞춘다.
 *    `escape`가 없으면 `false`다.
 * 3. Enter 반복: 막고 `activate`를 부르지 않는다. 수식 키 가드보다 앞이다.
 *    뒤에 두면 `Ctrl+Enter` 반복이 새어 나간다.
 * 4. 처음 Enter:
 *    - `activate`가 없으면 네이티브 click 경로다. 막지 않고 반복 억제만 건다.
 *      막으면 click이 나지 않아 확정되지 않는다. 수식 키는 따지지 않는다.
 *    - `activate`가 있으면 수식 키가 없을 때만 반복 억제를 걸고, 막고, 부른다.
 *      수식 키가 있으면 처리하지 않은 키이므로 `false`로 물러난다.
 *    - 반복 억제는 문서 capture 단계에서 반복 Enter를 삼킨다. Enter keyup이나
 *      반복이 아닌 keydown이 오면 스스로 푼다.
 * 5. 수식 키(Ctrl·Alt·Meta): 처리하지 않은 키이므로 `preventDefault`하지 않고
 *    `false`로 물러난다. `Alt+ArrowLeft`(뒤로 가기)와 `Ctrl+Tab`(탭 전환)
 *    같은 단축키가 막히지 않게 한다. `shiftKey`는 보지 않는다. 메뉴에서
 *    `Shift+Tab`은 닫기 키다.
 * 6. Tab: `tab`이 있으면 막고 부른다.
 * 7. 그 밖 키: `navigate(key)`가 `true`면 막는다. `false`거나 `navigate`가
 *    없으면 막지 않고 `false`다.
 *
 * 반환 `true`는 module이 키를 소비했다는 뜻이다. 호출부는 `true`면 물러난다.
 */

/**
 * `handleMenuKeyDown`이 읽는 keydown의 최소 구조. React 합성 이벤트와
 * 네이티브 `KeyboardEvent`가 모두 맞는다.
 * `isComposing`은 네이티브에 있고, 합성 이벤트는 `nativeEvent`에 있다.
 */
export type MenuKeyboardEvent = {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  nativeEvent?: { isComposing: boolean };
  preventDefault(): void;
  currentTarget: EventTarget | null;
};

export type MenuKeyboardHandlers = {
  /** 처음 Enter(수식 키 없음)에서 항목을 확정한다. 막는 일은 module이 한다. */
  activate?: () => void;
  /** 이동 키를 처리했으면 `true`. module이 `preventDefault`한다. */
  navigate?: (key: string) => boolean;
  /** Escape에서 닫는다. 막는 일은 module이 한다. */
  escape?: () => void;
  /** Tab에서 닫는다. 막는 일은 module이 한다. */
  tab?: () => void;
};

/** 문서별로 걸려 있는 반복 억제를 푸는 함수. 문서마다 하나만 둔다. */
const releaseByDocument = new WeakMap<Document, () => void>();

/** 이벤트 대상이 속한 문서. 대상이 문서 자신이면 그 문서다. */
const documentOf = (target: EventTarget | null): Document | null => {
  const node = target as Node | null;
  if (node === null || node === undefined) return null;
  if (node.nodeType === 9) return node as Document;
  return node.ownerDocument ?? null;
};

/**
 * 확정한 Enter의 자동 반복이 포커스가 옮겨 간 편집기에 닿지 않게 한다.
 *
 * 버튼은 keydown Enter마다 click을 낸다. 메뉴 항목을 Enter로 확정하면 메뉴가
 * 닫히고 포커스가 편집기로 돌아간다. 키를 떼기 전에 반복이 오면 편집기가
 * 그 Enter를 받아 선택 범위를 줄바꿈으로 바꾼다.
 *
 * 처음 누른 Enter의 keydown 핸들러에서 부른다. 문서 capture 단계에서 반복
 * Enter만 삼킨다. 다음 중 하나가 오면 스스로 푼다.
 * - Enter keyup.
 * - 반복이 아닌 keydown. 키를 새로 눌렀다는 뜻이다.
 *
 * 문서마다 하나만 건다. 같은 keydown을 항목 버튼과 컨테이너가 두 번 부를 수
 * 있어서(색상 메뉴의 스와치), 이미 걸려 있으면 먼저 풀고 새로 건다.
 */
const suppressEnterRepeat = (ownerDocument: Document): void => {
  releaseByDocument.get(ownerDocument)?.();

  const release = () => {
    ownerDocument.removeEventListener("keydown", onKeyDown, true);
    ownerDocument.removeEventListener("keyup", onKeyUp, true);
    if (releaseByDocument.get(ownerDocument) === release) {
      releaseByDocument.delete(ownerDocument);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    release();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Enter") release();
  };
  ownerDocument.addEventListener("keydown", onKeyDown, true);
  ownerDocument.addEventListener("keyup", onKeyUp, true);
  releaseByDocument.set(ownerDocument, release);
};

const isComposing = (event: MenuKeyboardEvent): boolean =>
  event.nativeEvent?.isComposing ?? event.isComposing ?? false;

const hasCommandModifier = (event: MenuKeyboardEvent): boolean =>
  event.ctrlKey || event.altKey || event.metaKey;

const suppressRepeatFor = (event: MenuKeyboardEvent): void => {
  const ownerDocument = documentOf(event.currentTarget);
  if (ownerDocument !== null) suppressEnterRepeat(ownerDocument);
};

/**
 * 메뉴 keydown을 위 순서로 처리한다. 소비했으면 `true`다.
 * `false`면 호출부가 나머지 키 처리를 이어 가거나 키를 그대로 흘린다.
 */
export const handleMenuKeyDown = (
  event: MenuKeyboardEvent,
  { activate, navigate, escape, tab }: MenuKeyboardHandlers,
): boolean => {
  if (isComposing(event)) return false;

  if (event.key === "Escape") {
    if (escape === undefined) return false;
    event.preventDefault();
    escape();
    return true;
  }

  if (event.key === "Enter") {
    if (event.repeat) {
      event.preventDefault();
      return true;
    }
    if (activate === undefined) {
      suppressRepeatFor(event);
      return true;
    }
    if (hasCommandModifier(event)) return false;
    suppressRepeatFor(event);
    event.preventDefault();
    activate();
    return true;
  }

  if (hasCommandModifier(event)) return false;

  if (event.key === "Tab") {
    if (tab === undefined) return false;
    event.preventDefault();
    tab();
    return true;
  }

  if (navigate?.(event.key) === true) {
    event.preventDefault();
    return true;
  }
  return false;
};
