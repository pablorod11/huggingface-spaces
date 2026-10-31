# Modified TinyStories sample

Source: Ronen Eldan and Yuanzhi Li, [roneneldan/TinyStories](https://huggingface.co/datasets/roneneldan/TinyStories). Revision f54c09fd23315a6f9c86f9dc80f725de7d8f9c64, V2 GPT-4 synthetic stories. The data is licensed under [Community Data License Agreement – Sharing, Version 1.0](https://cdla.dev/sharing-1-0/) (CDLA-Sharing-1.0), separately from the project's MIT code license. That unmodified license applies to these included data files.

These files have been changed: story subsets were selected, exact normalized duplicates removed, unsupported capitals lowercased, unsupported punctuation replaced by spaces, and curly apostrophes made ASCII. The unchanged model-002 character inventory is retained. The original raw prefixes are not redistributed. manifest.json records source URLs, revision, hashes, normalization, story membership and split sizes.

Train contains 512 whole stories from the official training file. Validation and test each contain 64 disjoint whole stories from the official validation file, after cross-split exact deduplication. Near duplicates were not assessed. The leading NOTICE line in each file is attribution, not training/evaluation text, and is stripped before tokenization.

Test stories never contribute to gradient updates or checkpoint selection. Fixed-window test metrics are calculated once, after validation selection. Windows within a split may overlap.
