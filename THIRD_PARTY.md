# PDF layout translation runtime

The workbench invokes a separately installed, user-local Python runtime. It does not copy Zotero plugin source.

- [PDFMathTranslate-next](https://github.com/PDFMathTranslate/PDFMathTranslate-next), version 2.9.0, AGPL-3.0.
- [BabelDOC](https://github.com/funstory-ai/BabelDOC), version 0.6.2, AGPL-3.0.
- [zotero-pdf2zh](https://github.com/guaguastandup/zotero-pdf2zh) is the user-provided workflow reference.

Upstream source and licenses remain in the isolated Python installation. Local adapters: paper-layout.js and pdf-layout-worker.py. The workbench uses the upstream API to produce mono (Chinese) and dual (left English/right Chinese) PDFs. Original PDF files are not modified.

`bitstring==4.4.0` is pinned because 5.0.0 removed the `BitStream` import used by BabelDOC 0.6.2.

The PDF text overlay uses Obsidian-provided [PDF.js](https://github.com/mozilla/pdf.js) TextLayer. Its positioning rules follow the upstream [text layer stylesheet](https://github.com/mozilla/pdf.js/blob/v5.3.31/web/text_layer_builder.css), Copyright 2014 Mozilla Foundation, Apache-2.0: https://www.apache.org/licenses/LICENSE-2.0. Rules are scoped and adapted for the workbench.
