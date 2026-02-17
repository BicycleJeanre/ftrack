# Overview

## 1.0 Purpose

FTrack documentation is displayed dynamically from Markdown files in the repository.

## 1.1 How This Page Works

1. Documentation files live under the `Documentation/` folder.
2. The app generates a manifest at build time in `assets/docs-manifest.json`.
3. The documentation UI loads the manifest, builds the sidebar, and renders Markdown content.

## 1.2 Document Categories

Categories are inferred from filename prefixes.

- `concepts_` files: User-facing concepts and how-to explanations
- `plan_` files: Planning and implementation notes
- `TECH_` files: Technical documentation
- `USER_` and `USAGE_` files: User documentation

New prefixes automatically create new categories.

## 1.3 Adding Or Updating Docs

1. Add or edit a Markdown file under `Documentation/`.
2. Ensure the first line is a clear document title using a `#` header.
3. Run `npm run docs:manifest` to regenerate `assets/docs-manifest.json`.

## 1.4 Deep Links

Docs can be deep-linked using the hash format.

- `#repo-docs/<docId>`

The `docId` is based on the filename without extension.
