# Third-party notices

Vendored dependencies that ship in the client and keep a licence notice. The
served copy, with the full licence text, is `public/third-party-notices.txt`
(at `/third-party-notices.txt` on both hosts), because minification removes
each library's own banner from the built chunks.

| Package | Version | Licence | Source | Where it runs |
|---|---|---|---|---|
| SheetJS Community Edition 0.20.3 (`xlsx`) | 0.20.3 | Apache-2.0 (`vendor/sheetjs/LICENSE`) | `vendor/sheetjs/xlsx-0.20.3.tgz` from `cdn.sheetjs.com`, sha-256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`, unmodified | Lote's parser worker only (ADR-0012) |

Copyright (C) 2012-present SheetJS LLC. Licensed under the Apache License,
Version 2.0.
