# Changesets

이 폴더의 마크다운 파일은 다음 배포에 포함될 변경 사항을 기록한다. 새 changeset을 추가하려면 다음을 실행한다.

```bash
pnpm changeset
```

`model`/`io`/`core`/`react` 4개는 `fixed` 그룹으로 묶여 있다([ADR-0018](../docs/adr/0018-lockstep-version-and-publish-four-npm-packages-together.md)) — 하나라도 bump가 필요하면 4개 전부 같은 버전으로 함께 오르고 함께 배포된다. `apps/demo`·`apps/showcase`·`fixtures/consumer`는 `private`이라 배포 대상이 아니고 `ignore`에 있다.

자세한 내용은 [changesets 문서](https://github.com/changesets/changesets)를 참고한다.
