# Issue tracker: GitHub

GitHub Issues is the canonical issue and specification tracker for this repository.

## Working convention

- Prefer the authenticated GitHub connector; otherwise use `gh` from an authenticated clone.
- Read the full issue state before acting: body, labels, comments, assignees, linked pull requests, sub-issues, and native dependencies where available.
- Keep one coherent problem or deliverable per issue, with acceptance criteria and blockers in the issue body.
- Pull requests are implementation/review artifacts, not a replacement issue tracker.
- Durable architecture or domain decisions belong in version-controlled repository documentation rather than only in issue comments.

## CLI fallback

For a quick issue view, use the fields supported by the installed `gh` client:

```bash
gh issue view <number> --json number,title,body,state,labels,assignees,comments,url
```

Dependency state is part of the minimum pre-work read and must be fetched before work starts. Prefer the authenticated GitHub connector. With `gh`, query the GraphQL Issue fields directly:

```bash
gh api graphql \
  -f owner=Avkroken \
  -f name=Produkter \
  -F number=<number> \
  -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          parent { number title state url }
          subIssues(first: 100) { nodes { number title state url } }
          blockedBy(first: 100) { nodes { number title state url } }
          blocking(first: 100) { nodes { number title state url } }
        }
      }
    }'
```

If the connector or API cannot expose one of those dependency relations, do not infer that the issue is unblocked; record the missing relation as unknown before acting.

When a skill says to publish or fetch a ticket, use this repository's GitHub Issues tracker.
