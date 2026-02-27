# Application Workflow Diagram

This document outlines the comprehensive workflow of the Production App, detailing user roles, authentication, context switching, and core data flows.

```mermaid
graph TD
    %% Global Styling
    classDef superAdmin fill:#ffeb3b,stroke:#fbc02d,stroke-width:2px,color:#000;
    classDef admin fill:#bbdefb,stroke:#1976d2,stroke-width:2px,color:#000;
    classDef database fill:#c8e6c9,stroke:#388e3c,stroke-width:2px,color:#000;
    classDef component fill:#ffffff,stroke:#cfd8dc,stroke-width:2px,color:#000;
    classDef critical fill:#ffcdd2,stroke:#d32f2f,stroke-width:2px,color:#000;

    subgraph "1. Authentication"
        User((User)) -->|Credentials| Login[Login Page]
        Login -->|Supabase Auth| FetchProfile[Fetch User Profile]
        FetchProfile -->|Get Role & Dept| AuthContext[Auth Context]
    end

    subgraph "2. Context Management (The Core Logic)"
        AuthContext --> CheckRole{Check User Role}
        
        CheckRole -->|SUPER_ADMIN| SA_Flow[Super Admin Flow]:::superAdmin
        CheckRole -->|ADMIN / CREW| Reg_Flow[Regular User Flow]:::admin

        %% Super Admin Flow
        SA_Flow -->|Default| GlobalContext[Context: Global / All Depts]:::superAdmin
        SA_Flow -->|Navbar Switcher| SwitchContext[Switch Department Request]:::superAdmin
        SwitchContext -->|Select Dept| SpecificContext[Context: Specific Dept ID]:::superAdmin
        SwitchContext -->|Select Global| GlobalContext

        %% Regular Flow
        Reg_Flow -->|Locked| UserDeptContext[Context: User's Department]:::admin
    end

    subgraph "3. Data Fetching & Security"
        GlobalContext -->|Admin API| API_Admin[API: /api/admin/*]:::critical
        SpecificContext -->|Restricted API| Hooks[React Query Hooks]
        UserDeptContext -->|Restricted API| Hooks

        API_Admin -->|Bypass RLS| DB[(Supabase DB)]:::database
        Hooks -->|Apply RLS| DB:::database
    end

    subgraph "4. Application Features"
        Dashboard[Dashboard Overview]:::component
        Inventory[Inventory Management]:::component
        Shoots[Shoot Management]:::component
        Users[User Management]:::component

        GlobalContext -.-> Dashboard
        SpecificContext -.->|Filtered View| Dashboard
        SpecificContext -.->|Filtered View| Inventory
        SpecificContext -.->|Filtered View| Shoots
        
        UserDeptContext -.-> Dashboard
        UserDeptContext -.-> Inventory
        UserDeptContext -.-> Shoots
    end

    %% Legend / Notes
    linkStyle default stroke:#607d8b,stroke-width:2px;
```

## How to View
This diagram is written in **Mermaid.js**. You can view it visually by:
1.  Using the **Markdown Preview** in VS Code (`Ctrl+Shift+V`).
2.  Viewing this file on **GitHub**.
3.  Pasting the code block above into the [Mermaid Live Editor](https://mermaid.live).
