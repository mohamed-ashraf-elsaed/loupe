<div align="center">

<a href="https://mohamed-ashraf-elsaed.github.io/loupe/">
  <img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/store/promo-marquee-1400x560.jpg" alt="Loupe — Pin feedback to the live UI. Hand it to Claude." width="100%" />
</a>

<h1>@loupekit/shared</h1>

<p><strong>The canonical TypeScript types and pure helpers shared across Loupe.</strong><br />
The SDK, backend API, dashboard, and MCP server all import from here — so a comment means the
same thing everywhere in the loop.</p>

<p>
  <a href="https://www.npmjs.com/package/@loupekit/shared"><img src="https://img.shields.io/npm/v/@loupekit/shared?color=4a55d6&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@loupekit/shared"><img src="https://img.shields.io/npm/dm/@loupekit/shared?color=4a55d6" alt="npm downloads" /></a>
  <img src="https://img.shields.io/npm/types/@loupekit/shared?color=4a55d6" alt="TypeScript types" />
  <img src="https://img.shields.io/badge/dependencies-0-4a55d6" alt="Zero dependencies" />
  <img src="https://img.shields.io/npm/l/@loupekit/shared?color=4a55d6" alt="MIT license" />
</p>

<p>
  <a href="https://mohamed-ashraf-elsaed.github.io/loupe/"><b>Website</b></a> ·
  <a href="https://mohamed-ashraf-elsaed.github.io/loupe/guide/"><b>Docs</b></a> ·
  <a href="https://github.com/mohamed-ashraf-elsaed/loupe"><b>GitHub</b></a> ·
  <a href="https://www.npmjs.com/package/@loupekit/sdk"><b>SDK</b></a> ·
  <a href="https://www.npmjs.com/package/@loupekit/mcp"><b>MCP server</b></a>
</p>

</div>

---

This is the **contract layer** of the [Loupe](https://github.com/mohamed-ashraf-elsaed/loupe)
visual-feedback platform — no runtime dependencies, not a feature. If you're building on
Loupe, install the [SDK](https://www.npmjs.com/package/@loupekit/sdk) or
[MCP server](https://www.npmjs.com/package/@loupekit/mcp) instead; this package is pulled in
for you.

## Install

```bash
npm i @loupekit/shared
```

> Also mirrored to **GitHub Packages** as `@mohamed-ashraf-elsaed/shared` — add
> `@mohamed-ashraf-elsaed:registry=https://npm.pkg.github.com` to your `.npmrc` to install from there.

## Types

| Type | Purpose |
| --- | --- |
| **`Comment`** | A piece of visual feedback: body, author, status, element `anchor`, captured `context` (HTML + styles), screenshot URL. `kind` is `"element"`, `"region"` (+ a `region` rectangle), or `"free"` — a page-level note with no element and no screenshot, positioned via `offset`. |
| **`Anchor`** | The multi-signal element fingerprint (tag, CSS path, XPath, testid, text, attributes, nth-of-type, rect, viewport) used to re-locate an element after a redeploy. |
| **`ElementContext`** | The target's `outerHTML` + a curated slice of computed styles. |
| **`RegionRect`** | A free-region rectangle in document coordinates, with optional element-relative fractions (`rel`) so regions track responsive reflow. |
| **`LoupeUser`**, **`CommentStatus`**, **`CommentKind`** | Identity and workflow enums. |

## Helper: `normalizeUrl(input)`

Normalizes a page URL so comments don't fragment across tracking / volatile query params.

```ts
import { normalizeUrl } from "@loupekit/shared";

normalizeUrl("/checkout?utm_source=x&gclid=123&step=2");
// → "/checkout?step=2"
```

It:

- strips `utm_*`, click ids (`gclid`, `fbclid`, `msclkid`, …), and Loupe's own dev params (`api`, `key`),
- sorts the remaining params for stability,
- drops trailing slashes.

So a comment on `/checkout?utm_source=x` and one on `/checkout` land on the **same** page.

## Notes

- ESM-only; ships compiled JS + `.d.ts` (`main` / `types` → `dist`).
- Node packages import the compiled JS; browser packages import the types.

## Related packages

| Package | Description |
| --- | --- |
| [`@loupekit/sdk`](https://www.npmjs.com/package/@loupekit/sdk) | The embeddable visual-feedback widget. |
| [`@loupekit/mcp`](https://www.npmjs.com/package/@loupekit/mcp) | The MCP server that hands comments to Claude Code. |

## License

MIT © [Mohamed Ashraf Elsaed](https://github.com/mohamed-ashraf-elsaed)
