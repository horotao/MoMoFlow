# GPT Image 2.6 migration ledger

2026-11-09 · MoMoFlow · implementation authorized by the user.
Credential decision: user explicitly chose reuse of the existing OpenAI key. No secrets changed.

## Approved stage

Replace GPT Image 2.5 with 2.6 Sunburst and Flare; rename the node to GPT Image 2.6;
default unspecified provider to OpenAI. Retain explicitly saved ZenMux selections and the
existing image endpoints, ports, raster outputs, sizes, mask conversion and error handling.
Retain node type `sunburst` for saved-workflow compatibility. Queue snapshots contain both
provider and variant; old 2.5 results remain visible but cannot satisfy a 2.6 cache signature.

## Sources and integration choice

- https://developers.openai.com/api/docs/guides/image-generation — both 2.6 variants,
  quality tiers, raster output and edit support; additional complexity/SVG/GIF features exist.
- https://developers.openai.com/api/reference/resources/images/methods/generate
- https://developers.openai.com/api/reference/resources/images/methods/edit
- https://zenmux.ai/openai — confirms `openai/gpt-image-2.6-sunburst` and `openai/gpt-image-2.6-flare`.

Preserve fetch + Images API: JSON generations, multipart edits. No Responses/SDK migration
is needed for this existing standalone image-node workload. The optional new GIF/markup
and complexity UI are outside this model-replacement request; complexity uses the provider default.
ZenMux retains the existing four-quality UI contract; no new channel capabilities claimed.
No changes to storage, regional endpoint, service tier, concurrency, or retention policy.

## Guidance assessment

| Guidance heading | Decision and evidence |
| --- | --- |
| Model Selection | Implemented: requested 2.6 Sunburst/Flare in generation, reference-image and masked-edit paths. |
| Instruction File Naming | Already present: repository instructions unchanged. |
| Migrate from Chat Completions to the Responses API | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Streaming | Not applicable to this replacement: retain existing buffered image request and cancellation behavior. |
| WebSocket Mode | Not applicable to this replacement: retain existing buffered image request and cancellation behavior. |
| Data Privacy and Residency | Already present: preserve local workflow/asset ownership and existing stateless image endpoint configuration; no new retention claims. |
| Zero Data Retention | Already present: preserve local workflow/asset ownership and existing stateless image endpoint configuration; no new retention claims. |
| Data Residency | Already present: preserve local workflow/asset ownership and existing stateless image endpoint configuration; no new retention claims. |
| Processing Tiers | Already present: ordinary Images API requests; no new tier or batch service. |
| Prompt Caching | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Prompt Cache Keys | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Extended Cache Retention for Earlier Models | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Explicit Cache Breakpoints for GPT-5.6 and Later | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Prompt Cache Diagnostics | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| State Management | Already present: preserve local workflow/asset ownership and existing stateless image endpoint configuration; no new retention claims. |
| Instruction Persistence Gotcha | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Reasoning | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Encrypted Reasoning Items | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Reasoning Effort | Not applicable to requested UI: optional image complexity omitted, retaining provider default. |
| Reasoning Preservation | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Reasoning Summaries and Tool-Call Preambles | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Verbosity | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Maximum Output Tokens | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Assistant Message Phases | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Context Compaction | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Structured Outputs | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Tools | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Tool Choice | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Tool Search and Additional Tools | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Parallel Tool Calls | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Programmatic Tool Calling | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |
| Model-Aligned Tool Interfaces | Not applicable: standalone buffered Images API workload, no Responses conversation or tool loop; no change. |

## Verification

Focused mocked tests cover exact IDs, both variants on generation and masked edits, channel
credentials/no fallback, queue snapshot immutability, clipboard, and cache invalidation.
Full repository gate: `npm run check` passed (454 tests, lint, typecheck, production build,
node docs and diff checks). Isolated `/tests/sunburst-provider.html`: 68 checks passed.
Native browser pointer checks passed for node dragging/coordinate updates, new image-port
connections and wheel zoom. This checkout has no mounted minimap or zoom-button controls.
Screenshot: `/tmp/momoflow-gpt-image-26.png`. Additional existing Resize and Matte Grow/Shrink
browser regressions passed with mocked downstream image calls.
Approved stage complete; no remaining requested implementation work. Live model output/permission
verification remains unrun; automated checks do not establish account-level model access.
No real paid image generation is part of these checks. No deployment or commit requested.


## Follow-up: SVG output (authorized)

User requested actual vector SVG output. Same existing credential decision applies.
Add SVG choice, generation-only input guards (including graph preflight), strict XML/vector
validation with saxes at server and client, exact SVG MIME/bytes through display, download
and persistence. Do not rasterize provider output or accept embedded raster wrappers.
Per-request n=1 retained; multiple requested runs remain separate tasks.
Tests: Node built-in runner (`npm test`) for XML validation, provider payload/response,
client byte preservation and workflow preflight. Browser fixture remains
`/tests/sunburst-provider.html` with synthetic SVG responses and no paid calls.
Browser verification passed: 78 mock checks, including both variants, exact SVG bytes, download, IndexedDB restoration and invalid-result retention; native drag, connection and wheel zoom also passed. Screenshot: `/tmp/momoflow-svg-preview.png`. Focused workflow regression passed (58 tests). Full repository gate is run before handoff; no real paid SVG request was made.


## Fix: required SVG author model (authorized)

The user supplied OpenAI HTTP 400 `missing_required_parameter`: SVG generation requires
`svg.model`. The previous mock contract omitted this requirement. Official Images API
reference distinguishes the reference-image model from the SVG author:
https://developers.openai.com/api/reference/resources/images/methods/generate

Added `svg: { model: 'gpt-6.1-sol' }` only to OpenAI SVG generations. Existing key's
read-only `/v1/models` listing confirms access; model documentation confirms vision input
and text output. Both Sunburst and Flare mock wire tests now require this exact nested
object. Regression matrix asserts absence for raster generations, edits and ZenMux.

Real verification: one request through the local `/api/sunburst` middleware, OpenAI Flare,
low quality, 1024x1024, simple blue circle. HTTP 200; returned 205-byte UTF-8 SVG containing
only svg/rect/circle, no embedded raster. Passed the same pure-vector validator; artifact:
`/tmp/momoflow-svg-author-live.svg`. No retries or second billed request. Real Sunburst
SVG was not separately called. Full `npm run check` runs before handoff.


## SVG author preference update

User explicitly requested `gpt-6.1-terra` instead of Sol for SVG authoring.
Changed the server default and wire-contract expectations for both image variants,
and updated the current setup documentation. Earlier successful paid verification used
Sol; it does not establish live Terra SVG acceptance. No additional paid call for this
configuration change. Full repository gate runs before handoff.
