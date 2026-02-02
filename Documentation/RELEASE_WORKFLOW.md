# Production Release Workflow

**Version**: 2.0.0  
**Last Updated**: February 2, 2026  
**Purpose**: AI-executable deployment checklist

---

## Instructions for AI

Execute each step in order. Verify completion before proceeding. Ask user to confirm critical actions (tag, merge to main, push).

---

## Step 1: Update Version Files

Update version number (format: `MAJOR.MINOR.PATCH-suffix`, e.g., `0.7.2-beta`):

- [ ] Update `version` field in [package.json](../package.json)
- [ ] Update version in [CHANGELOG.md](../CHANGELOG.md) header
- [ ] Update version in [pages/home.html](../pages/home.html) "What's New" section

---

## Step 2: Update Documentation

**In-App Documentation** (user-facing):
- [ ] [pages/home.html](../pages/home.html) - Add release to "What's New" (keep last 3 releases only)
- [ ] [pages/documentation.html](../pages/documentation.html) - Update if features changed

**Repository Documentation** (developer-facing):
- [ ] [CHANGELOG.md](../CHANGELOG.md) - Document all changes (Added, Changed, Fixed, Removed)
- [ ] [Documentation/TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md) - Update if architecture changed
- [ ] Update relevant TECH_*.md files if data models or UI patterns changed

---

## Step 3: Commit and Tag

**Commit version bump:**
```bash
git add .
git commit -m "Bump version to vX.Y.Z-suffix

Changed files:
- package.json: version update
- CHANGELOG.md: release notes
- pages/home.html: What's New section
[list other changed files]"
```

**Create annotated tag:**
```bash
git tag -a vX.Y.Z-suffix -m "Version X.Y.Z-suffix - [Brief Description]

Major Features:
- Feature 1
- Feature 2

Status: [Ready for production / Beta testing / etc]"
```

---

## Step 4: Deploy to Production

⚠️ **CRITICAL**: Pushing to `main` automatically deploys to production website

- [ ] Merge `dev` to `main`: `git checkout main && git merge dev`
- [ ] Push to production: `git push origin main`
- [ ] Push tags: `git push origin --tags`
- [ ] Verify deployment successful

---

## Version Numbering Reference

- **MAJOR**: Breaking changes or major rewrites
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes only
- **Suffixes**: `-alpha` (early), `-beta` (testing), none (stable)

---
