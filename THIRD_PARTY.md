# PDF layout translation runtime

The workbench invokes a separately installed, user-local Python runtime. It does not copy Zotero plugin source.

- [PDFMathTranslate-next](https://github.com/PDFMathTranslate/PDFMathTranslate-next), version 2.9.0, AGPL-3.0.
- [BabelDOC](https://github.com/funstory-ai/BabelDOC), version 0.6.2, AGPL-3.0.
- [zotero-pdf2zh](https://github.com/guaguastandup/zotero-pdf2zh) is the user-provided workflow reference.

Upstream source and licenses remain in the isolated Python installation. Local adapters: paper-layout.js and pdf-layout-worker.py. The workbench uses the upstream API to produce mono (Chinese) and dual (left English/right Chinese) PDFs. Original PDF files are not modified.

`bitstring==4.4.0` is pinned because 5.0.0 removed the `BitStream` import used by BabelDOC 0.6.2.

The PDF text overlay uses Obsidian-provided [PDF.js](https://github.com/mozilla/pdf.js) TextLayer. Its positioning rules follow the upstream [text layer stylesheet](https://github.com/mozilla/pdf.js/blob/v5.3.31/web/text_layer_builder.css), Copyright 2014 Mozilla Foundation, Apache-2.0: https://www.apache.org/licenses/LICENSE-2.0. Rules are scoped and adapted for the workbench.

## Bundled chat interface

- [assistant-ui](https://github.com/assistant-ui/assistant-ui): `@assistant-ui/react` 0.15.30 and `@assistant-ui/react-markdown` 0.14.24, MIT.
- [React](https://github.com/facebook/react): React and React DOM 19.3.1, MIT.
- [remark-gfm](https://github.com/remarkjs/remark-gfm): 4.0.1, MIT; enables tables, task lists, strikethrough, autolinks and footnotes in chat Markdown.

The workbench uses assistant-ui primitives and LocalRuntime with local history and MiniMax model adapters. No assistant-cloud account or service is used. The release archive includes `THIRD_PARTY_LICENSES.txt` generated from dependencies present in the bundle; esbuild also preserves upstream legal comments in `main.js`.

## Recommendation rubric and migration

The scoring prompt is adapted from [WujieHOT](https://github.com/Pytorchlover/WujieHOT), commit `5af82e82cb37b9b6bcd3598877feba14a1924d29`, itself based on AIHOT. The upstream MIT notice (Copyright 2026 数字生命卡兹克) is preserved in `docs/licenses/WujieHOT-LICENSE.txt` and included in the built release notices. The attention score is not an academic quality certification.

The optional offline Zotero migration script uses a separately installed PyMuPDF 1.26.5 (AGPL-3.0 / commercial licensing). PyMuPDF is not bundled with the Obsidian plugin. See [PyMuPDF licensing](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright).
