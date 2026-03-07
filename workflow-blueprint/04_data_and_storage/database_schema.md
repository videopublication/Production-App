# Database Schema & Data Flow

## Core Entities

### 1. `inventory`
*   **PK:** `id` (uuid)
*   **Key Fields:** `model_name`, `serial_number`, `status` (`AVAILABLE` | `IN_USE` | `MAINTENANCE`), `category`
*   **Purpose:** The physical assets.

### 2. `users`
*   **PK:** `id` (links to `auth.users`)
*   **Key Fields:** `role` (`ADMIN` | `CREW`), `status`.
*   **Purpose:** Personnel profiles.

### 3. `shoots`
*   **PK:** `id`
*   **Key Fields:** `start_time`, `end_time`, `assignments` (JSONB legacy or linked).
*   **Purpose:** The event container.

### 4. `transactions` (The Linker)
*   **PK:** `id`
*   **Foreign Keys:** `user_id`, `shoot_id`
*   **Status:** `OPEN` (Checked Out) -> `CLOSED` (Returned).
*   **Purpose:** Links a User + Shoot -> List of Items.

### 5. `transaction_items`
*   **PK:** `id`
*   **Foreign Keys:** `transaction_id`, `inventory_id`
*   **Purpose:** Granular tracking of specific items within a checkout bundle.

## Data Flow: The Check-Out
1.  **Frontend:** Collects `inventory_ids`.
2.  **StorageService:**
    *   Creates 1 `transaction` record.
    *   Creates N `transaction_items` records.
    *   Updates N `inventory` records to `status: IN_USE`.
    *   **Atomic Operation:** This should ideally happen in a transaction block (or verified sequentially).
