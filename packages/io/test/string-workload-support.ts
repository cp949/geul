/**
 * 복잡도 회귀 테스트(G-TST-004)가 공유하는 String.prototype 작업량 계측이다.
 *
 * 대상 함수가 입력을 읽는 데 쓰는 `String.prototype` 메서드(split·indexOf·
 * slice·trim·replace 등)를 감싸 두 축을 센다.
 * 1. 호출 횟수: 이미 읽은 조각을 되돌아가 다시 처리하는 형태는 호출 횟수가
 *    입력 크기의 제곱으로 뛴다.
 * 2. 처리 문자 수: 호출마다 수신 문자열의 길이를 더한다. 호출 횟수가 선형이어도
 *    긴 문자열 전체를 위치마다 다시 처리하는 형태는 처리 문자 수가 제곱으로
 *    뛴다. 호출 횟수만 세면 놓친다.
 *
 * 한계: 정규식 엔진 내부 작업은 이 계측에 잡히지 않는다. 정규식을 쓰는 함수는
 * 정규식 자체가 선형인지 따로 확인해야 한다. 기계 속도와 동시 실행 부하에
 * 의존하지 않는다.
 */

const INSTRUMENTED_METHODS = [
  "split",
  "indexOf",
  "lastIndexOf",
  "slice",
  "substring",
  "trim",
  "trimStart",
  "trimEnd",
  "toLowerCase",
  "toUpperCase",
  "startsWith",
  "endsWith",
  "includes",
  "charAt",
  "charCodeAt",
  "codePointAt",
  "at",
  "replace",
  "replaceAll",
  "match",
  "matchAll",
  "search",
] as const;

export type StringWorkload = { calls: number; chars: number };

type StringMethod = (this: string, ...args: unknown[]) => unknown;

const originals = new Map<string, PropertyDescriptor>();

/** 감싼 메서드를 원래대로 되돌린다. 계측이 던져도 남지 않게 afterEach에서 부른다. */
export const restoreStringMethods = (): void => {
  for (const [name, descriptor] of originals) {
    Object.defineProperty(String.prototype, name, descriptor);
  }
  originals.clear();
};

/**
 * `run` 한 번 동안 String.prototype 메서드 호출 횟수와 수신 문자열 길이 합을
 * 센다. 계측 코드는 `.length`와 숫자 덧셈만 쓴다 — 계측된 메서드를 부르면
 * 자기 호출까지 세어 결과가 오염된다. `run` 안에서는 단언하지 않는다.
 */
export const measureStringWorkload = (run: () => void): StringWorkload => {
  const workload: StringWorkload = { calls: 0, chars: 0 };

  for (const name of INSTRUMENTED_METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(String.prototype, name);
    if (descriptor === undefined) continue;
    originals.set(name, descriptor);
    const original = descriptor.value as StringMethod;
    Object.defineProperty(String.prototype, name, {
      ...descriptor,
      value: function (this: string, ...args: unknown[]) {
        workload.calls += 1;
        workload.chars += this.length;
        return original.apply(this, args);
      },
    });
  }

  try {
    run();
  } finally {
    restoreStringMethods();
  }
  return workload;
};

// 대괄호 읽기(`value[index]`)를 세는 계측이다. 위 String 메서드 계측은 글자를
// 대괄호로 읽는 루프를 보지 못한다. `new String(value)`를 Proxy로 감싸 숫자 키
// `get`만 센다. 함수 속성(`slice`·`charCodeAt` 등)은 target에 bind해 돌려주고
// 세지 않는다. 계측 코드는 typeof와 Number 비교만 쓴다. String 메서드를 부르지
// 않아 읽기 수가 오염되지 않고, 전역을 바꾸지 않아 되돌릴 것도 없다.
// Proxy는 원시 문자열이 아니라서 `value === "inherit"` 같은 전체 일치 분기는
// 타지 않는다. 호출부의 입력 모양은 그 분기 밖이어야 한다.
// 읽기 수가 입력 길이의 `MAX_READS_PER_CHAR`배를 넘으면 던진다. vitest는 동기
// 루프를 중간에 끊지 못한다. 재순회 회귀가 생기면 상한이 없을 때 실패 보고까지
// 수 분에서 수십 분이 걸린다. 선형 구현의 읽기 수는 글자당 많아야 십여 회다.
export const MAX_READS_PER_CHAR = 32;

export const countIndexReads = (
  value: string,
  run: (proxy: string) => void,
): number => {
  let reads = 0;
  const limit = value.length * MAX_READS_PER_CHAR;
  const target = new String(value);
  const proxy = new Proxy(target, {
    get(boxed, key) {
      if (
        typeof key === "string" &&
        key !== "" &&
        Number.isInteger(Number(key))
      ) {
        reads += 1;
        if (reads > limit) {
          throw new Error(
            `대괄호 읽기가 입력 길이 ${value.length}의 ${MAX_READS_PER_CHAR}배를 넘었다`,
          );
        }
      }
      const member: unknown = Reflect.get(boxed, key, boxed);
      return typeof member === "function" ? member.bind(boxed) : member;
    },
  });
  run(proxy as unknown as string);
  return reads;
};
