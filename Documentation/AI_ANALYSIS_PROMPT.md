# AI Analysis Prompt for ftrack Repository

**Version**: 1.0.0  
**Purpose**: Comprehensive code quality and documentation analysis template

---

## Analysis Request

Please perform a comprehensive analysis of this repository focusing on code quality, maintainability, and documentation accuracy. Follow the structure below.

### 1.0 Repository Overview

1.1 Read `/Documentation/TECHNICAL_OVERVIEW.md` to understand architecture and design patterns
1.2 Identify the main technology stack and frameworks in use
1.3 Map the file structure and identify core vs. utility modules
1.4 Note any explicit coding standards or patterns mentioned in documentation

### 2.0 Code Quality Analysis

#### 2.1 File Size Management
- Identify files exceeding 1500 lines
- For large files, analyze what can be extracted:
  - Repeated event handlers
  - UI builder functions (toolbars, buttons, DOM construction)
  - Helper functions that could be utilities
  - Embedded modal implementations
  - Data transformation logic
- Recommend specific extraction targets with destination file paths

#### 2.2 Code Duplication
- Search for duplicated functions across multiple files
- Identify repeated patterns (platform detection, validation, formatting)
- Find duplicated modal implementations
- Locate repeated event handler patterns
- Recommend consolidation strategies preserving existing architecture

#### 2.3 Design Pattern Adherence
- Verify code follows documented architectural patterns
- Check separation of concerns (business logic vs. UI vs. utilities)
- Validate that managers handle business logic, not UI components
- Ensure consistent error handling and logging patterns

### 3.0 Library Usage Analysis

#### 3.1 Third-Party Library Usage
- Identify all external libraries and their versions
- Analyze usage patterns for consistency
- Check if library features are being used optimally
- For grid libraries (like Tabulator):
  - Verify column definitions are consistent
  - Check if built-in features could replace custom code
  - Validate that custom implementations are necessary (domain-specific logic)
  - Ensure filtering, sorting, aggregation align with data model needs

#### 3.2 Custom vs. Library Features
- Identify cases where custom code duplicates library functionality
- Identify cases where library features cannot replace custom logic (explain why)
- Recommend optimizations that preserve domain-specific requirements

### 4.0 Documentation Verification

#### 4.1 Documentation Completeness
- Verify all major features are documented in `/Documentation/USER_FEATURES.md`
- Check that technical architecture is accurately described in `/Documentation/TECH_*.md` files
- Ensure usage guides cover all user-facing functionality
- Verify quick guides exist for complex workflows

#### 4.2 Documentation Accuracy
- Compare documented data flows with actual implementation
- Verify architecture diagrams match current code structure
- Check that documented patterns are actually used in codebase
- Identify undocumented features or recent changes

#### 4.3 Documentation Format Standards
- Verify all documentation uses legal numbering (1.0, 1.1, 1.1.1)
- Check for modular structure (no monolithic docs over 500 lines)
- Ensure Mermaid diagrams follow syntax rules (no brackets except for circular nodes)
- Validate cross-references between documentation files

### 5.0 Maintainability Assessment

#### 5.1 Technical Debt
- Identify TODOs, FIXMEs, or commented-out code
- Find hard-coded values that should be configuration
- Locate magic numbers without explanation
- Check for error handling gaps

#### 5.2 Testing & Validation
- Identify validation logic for user input
- Check error messages are user-friendly
- Verify critical operations have appropriate safeguards
- Note any missing validation

### 6.0 Optimization Opportunities

#### 6.1 Performance
- Identify unnecessary data copying or transformations
- Find opportunities to cache repeated calculations
- Check for inefficient loops or searches
- Recommend specific optimizations with code examples

#### 6.2 Code Organization
- Suggest module extractions with clear boundaries
- Recommend file naming conventions for new extractions
- Propose refactoring that reduces coupling
- Prioritize improvements by impact vs. effort

### 7.0 Output Format

Provide analysis in a single markdown file with these sections:

**7.1 Executive Summary** (3-5 bullet points of key findings)

**7.2 Repository Strengths** (positive patterns worth maintaining)

**7.3 Critical Issues** (high priority, blocks maintainability)

**7.4 Code Quality Findings**
- File size issues with extraction recommendations
- Duplication patterns with consolidation targets
- Pattern adherence gaps

**7.5 Library Usage Findings**
- Optimal usage (confirm what's working well)
- Opportunities for better library utilization
- Necessary custom implementations (explain why)

**7.6 Documentation Gaps**
- Missing documentation
- Inaccurate documentation
- Format violations

**7.7 Recommended Actions** (prioritized list)
- Priority 1: Critical issues blocking maintainability
- Priority 2: High-impact improvements
- Priority 3: Nice-to-have optimizations

**7.8 Items Already Optimal** (what should NOT be changed)

---

## Analysis Guidelines

### Validation Over Assumption
- Read actual code before making recommendations
- Verify patterns across multiple files
- Understand domain logic before suggesting generic solutions
- Confirm documentation claims against implementation

### Preserve Design Intent
- Recommend changes within current architecture
- Don't suggest rewrites unless critically necessary
- Respect existing patterns if they serve the domain
- Explain why custom implementations may be optimal

### Practical Recommendations
- Provide specific file paths and function names
- Show code examples for suggested extractions
- Estimate complexity (simple/moderate/complex)
- Consider backwards compatibility for data files
    - Ensure proper updates are applied through migration module.

### Concise Output
- Keep sections focused and scannable
- Use bullet points over paragraphs
- Provide evidence (line numbers, file paths)
- Avoid repeating information across sections

---

## Success Criteria

Analysis is complete when:
- ✅ All files over 1000 lines have been reviewed with extraction recommendations
- ✅ All major libraries have usage patterns documented
- ✅ All documentation files have been verified for accuracy
- ✅ Specific, actionable recommendations provided with file paths
- ✅ Current optimal patterns have been identified and preserved
- ✅ Output follows legal numbering format (1.0, 1.1, 1.1.1)
