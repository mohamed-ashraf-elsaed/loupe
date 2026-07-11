# @loupekit/shared

**Canonical TypeScript types and pure helpers shared across [Loupe](https://github.com/mohamed-ashraf-elsaed/loupe)** —
the SDK, backend API, dashboard, and MCP server all import from here so a comment means the
same thing everywhere in the loop.

This package has no runtime dependencies. It's the contract layer, not a feature.

---

## Install

```bash
npm i @loupekit/shared
```

> Also mirrored to **GitHub Packages** as `@mohamed-ashraf-elsaed/shared`. To install from
> there, add `@mohamed-ashraf-elsaed:registry=https://npm.pkg.github.com` to your `.npmrc`.

## Types

- **`Comment`** — a piece of visual feedback: body, author, status, the element `anchor`,
  the captured `context` (HTML + styles), screenshot URL, and — for free-region comments —
  `kind: "region"` plus a `region` rectangle.
- **`Anchor`** — the multi-signal element fingerprint (tag, CSS path, XPath, testid, text,
  attributes, nth-of-type, bounding rect, viewport) used to re-locate an element after a
  redeploy.
- **`ElementContext`** — the target's `outerHTML` and a curated slice of computed styles.
- **`RegionRect`** — a free-region rectangle in document coordinates, with optional
  element-relative fractions (`rel`) so regions track responsive reflow.
- **`LoupeUser`**, **`CommentStatus`**, **`CommentKind`** — identity and workflow enums.

## Helper: `normalizeUrl(input)`

Normalizes a page URL so comments don't fragment across tracking/volatile query params.

```ts
import { normalizeUrl } from "@loupekit/shared";

normalizeUrl("/checkout?utm_source=x&gclid=123&step=2");
// → "/checkout?step=2"
```

It:

- strips `utm_*`, click ids (`gclid`, `fbclid`, `msclkid`, …), and Loupe's own dev params
  (`api`, `key`),
- sorts the remaining params for stability,
- drops trailing slashes.

So a comment on `/checkout?utm_source=x` and one on `/checkout` land on the **same** page and
don't split into two buckets.

## Usage notes

- ESM-only, ships compiled JS + `.d.ts` (`main`/`types` → `dist`).
- Node packages in the monorepo import the compiled JS; browser packages import the types.

## Related packages

- [`@loupekit/sdk`](https://www.npmjs.com/package/@loupekit/sdk) — the embeddable widget.
- [`@loupekit/mcp`](https://www.npmjs.com/package/@loupekit/mcp) — the MCP server for Claude Code.

## License

MIT © [Mohamed Ashraf Elsaed](https://github.com/mohamed-ashraf-elsaed)
