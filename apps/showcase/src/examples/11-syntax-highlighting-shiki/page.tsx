import { ExamplePage } from "../../example-shell/example-page.js";
import SyntaxHighlightingShikiExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const SyntaxHighlightingShikiPage = () => (
  <ExamplePage
    description="shiki(VS Code 문법 엔진)로 만든 SyntaxHighlighter 함수를 EditorProvider에 연결한 예제다. 문법 엔진 초기화가 비동기라 SyntaxHighlighter의 Promise 반환 분기를 실제로 시연한다. shiki는 색상(hex)만 주므로 어댑터가 색상별 class를 만들고, 그 class에 대응하는 스타일시트를 테마에서 계산해 함께 렌더한다."
    source={exampleSource}
    title="Syntax highlighting (shiki)"
  >
    <SyntaxHighlightingShikiExample />
  </ExamplePage>
);

export default SyntaxHighlightingShikiPage;
