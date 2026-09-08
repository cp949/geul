import { ExamplePage } from "../../example-shell/example-page.js";
import CompositeExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const CompositePage = () => (
  <ExamplePage
    description="지금까지 본 표면 전부를 한 문서에 합쳤다 — 실전에서 이렇게 조합한다. HTML/GFM 변환(@cp949/geul-io)은 이 쇼케이스 범위 밖이다."
    source={exampleSource}
    title="Kitchen sink"
  >
    <CompositeExample />
  </ExamplePage>
);

export default CompositePage;
