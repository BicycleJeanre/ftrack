# Debt Repayment - Architecture Diagram

## Implementation Flow Within Current Architecture

```mermaid
flowchart TB
    subgraph "1. Configuration Layer"
        LookupData["assets/lookup-data.json<br/>Add: Debt Repayment entry<br/>- showSummaryCards: true<br/>- showBudget: false"]
    end
    
    subgraph "2. UI Layer - forecast.js"
        BuildGrid["buildGridContainer()<br/>Add: summaryCardsSection"]
        GetConfig["getScenarioTypeConfig()<br/>Existing pattern"]
        Visibility["Apply Visibility Logic<br/>if typeConfig.showBudget<br/>if typeConfig.showSummaryCards"]
        LoadCards["loadDebtSummaryCards<br/>NEW Function<br/>Calculate metrics<br/>Render cards"]
        Refresh["Refresh Hooks<br/>After: loadAccountsGrid<br/>After: generateProjections"]
    end
    
    subgraph "3. Data Access Layer - data-manager.js"
        GetProj["getProjections<br/>Existing"]
        GetAcct["getAccounts<br/>Existing"]
    end
    
    subgraph "4. Calculation Layer - projection-engine.js"
        ProjEngine["generateProjections<br/>Existing<br/>NO CHANGES"]
    end
    
    subgraph "5. Styling Layer - app.css"
        CSS["Add CSS<br/>.summary-cards-grid<br/>.summary-card<br/>.overall-total"]
    end
    
    LookupData -->|Read on startup| BuildGrid
    BuildGrid --> GetConfig
    GetConfig --> Visibility
    Visibility -->|if enabled| LoadCards
    LoadCards -->|Reads| GetProj
    LoadCards -->|Reads| GetAcct
    GetProj -->|From| ProjEngine
    LoadCards -->|Styled by| CSS
    Refresh -->|Calls| LoadCards
    
    style LookupData fill:#e1f5ff
    style BuildGrid fill:#f3e5f5
    style GetConfig fill:#f3e5f5
    style Visibility fill:#f3e5f5
    style LoadCards fill:#fff3e0
    style Refresh fill:#f3e5f5
    style GetProj fill:#e8f5e9
    style GetAcct fill:#e8f5e9
    style ProjEngine fill:#e8f5e9
    style CSS fill:#fce4ec
```

## Data Flow: Scenario Selection to Card Rendering

```mermaid
flowchart LR
    User["User selects<br/>Debt Repayment"]
    User -->|Triggers| LoadScenario["loadScenario"]
    LoadScenario -->|Calls| GetConfig["getScenarioTypeConfig"]
    GetConfig -->|Returns| TypeConfig["typeConfig object<br/>showSummaryCards: true<br/>showBudget: false"]
    TypeConfig -->|Used by| VisLogic["Visibility Logic"]
    VisLogic -->|Hides| BudgetSec["Budget Section"]
    VisLogic -->|Shows| SummarySec["Summary Cards Section"]
    VisLogic -->|Calls| LoadCards["loadDebtSummaryCards"]
    LoadCards -->|Reads| CurScenario["currentScenario<br/>- accounts<br/>- projections"]
    LoadCards -->|Calculates| Metrics["Per-account metrics<br/>- Current Balance<br/>- Projected End<br/>- Interest Paid<br/>- Payoff Date"]
    Metrics -->|Renders| Cards["Summary Cards<br/>Grid"]
    
    style User fill:#c8e6c9
    style TypeConfig fill:#e1bee7
    style BudgetSec fill:#ffccbc
    style SummarySec fill:#b3e5fc
    style Metrics fill:#fff9c4
    style Cards fill:#b3e5fc
```

## Code Modification Summary

```
┌─────────────────────────────────────────────────────────────┐
│ EXISTING PATTERN (Already in place)                         │
│                                                              │
│ typeConfig = getScenarioTypeConfig()                        │
│ if (typeConfig.showAccounts)                                │
│   accountsSection.classList.remove('hidden')               │
│ if (typeConfig.showProjections)                             │
│   projectionsSection.classList.remove('hidden')            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ MINIMAL EXTENSIONS (What we add)                            │
│                                                              │
│ 1. lookup-data.json:                                        │
│    Add entry with showSummaryCards: true                    │
│                                                              │
│ 2. forecast.js - Add 2 lines to existing visibility block:  │
│    if (typeConfig.showBudget !== false)                     │
│      budgetSection.classList.remove('hidden')              │
│    if (typeConfig.showSummaryCards)                         │
│      summaryCardsSection.classList.remove('hidden')        │
│                                                              │
│ 3. forecast.js - buildGridContainer():                      │
│    Insert summaryCardsSection before accounts section       │
│                                                              │
│ 4. forecast.js - New function:                              │
│    loadDebtSummaryCards(container) - ~50 lines              │
│                                                              │
│ 5. forecast.js - Refresh hooks:                             │
│    Call loadDebtSummaryCards() after data changes           │
│                                                              │
│ 6. app.css - Add CSS:                                       │
│    .summary-cards-grid { display: grid; ... }              │
│    .summary-card { ... }                                    │
│    .overall-total { ... }                                   │
└─────────────────────────────────────────────────────────────┘
```

## Section Visibility Matrix

```
                 Budget | General | Funds | Debt Repayment
────────────────────────────────────────────────────────────
Scenarios           ✓      ✓        ✓         ✓
Summary Cards       ✗      ✗        ✗         ✓ (NEW)
Accounts            ✓      ✓        ✓         ✓
Planned Tx          ✓      ✓        ✓         ✓
Actual Tx           ✓      ✗        ✗         ✗
Budget              ✓      ✗        ✗         ✗ (NEW: hidden)
Projections         ✓      ✓        ✓         ✓
```

## Summary Card Calculation Engine

```mermaid
flowchart TB
    Start["Load Debt Summary Cards"]
    Start --> GetAccounts["Get scenario.accounts"]
    GetAccounts --> GetProjections["Get scenario.projections"]
    GetProjections --> ForEachAcct["For each account"]
    
    ForEachAcct --> Current["currentBalance<br/>= account.balance"]
    ForEachAcct --> FindEnd["projectedEnd<br/>= last projection.balance<br/>or currentBalance if no projections"]
    ForEachAcct --> FindPayoff["payoffDate<br/>= first projection where<br/>balance ≤ 0<br/>or null if never"]
    ForEachAcct --> SumInterest["interestPaid<br/>= sum of all interest<br/>for this account"]
    
    Current --> RenderCard["Render Card:<br/>- Account Name<br/>- Current<br/>- Projected End<br/>- Payoff Date<br/>- Interest Paid"]
    FindEnd --> RenderCard
    FindPayoff --> RenderCard
    SumInterest --> RenderCard
    
    RenderCard --> Overall["Calculate Overall Total"]
    Overall --> TotalCurrent["totalCurrent<br/>= sum all account.balance"]
    Overall --> TotalEnd["totalProjectedEnd<br/>= sum all last projections"]
    Overall --> TotalInterest["totalInterest<br/>= sum all interest"]
    Overall --> AcctCount["accountCount<br/>= number of accounts"]
    
    TotalCurrent --> RenderTotal["Render Overall Card:<br/>- Current<br/>- Projected End<br/>- Interest<br/>- Account Count"]
    TotalEnd --> RenderTotal
    TotalInterest --> RenderTotal
    AcctCount --> RenderTotal
    
    RenderTotal --> Done["Display Cards Grid"]
    
    style Start fill:#c8e6c9
    style RenderCard fill:#bbdefb
    style RenderTotal fill:#ffe0b2
    style Done fill:#c8e6c9
```

## No Changes Required In

```
✅ data-manager.js - Uses existing getProjections, getAccounts
✅ projection-engine.js - Calculation logic stays same
✅ Account manager - No changes
✅ Transaction manager - No changes
✅ Budget manager - No changes
✅ Modal files - No changes
✅ Grid factory - No changes
✅ Data store - No changes
✅ Data model - No schema changes
```

