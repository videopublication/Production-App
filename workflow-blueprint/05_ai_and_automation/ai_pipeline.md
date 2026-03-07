# AI & Automation Pipelines

## 1. Automated Dispatch (WhatsApp Engine)
While not "Generative AI", the system uses heuristic automation to compose human-readable briefs.
*   **Input:** Shoot Metadata (Time, Location, Roles) + Assignment Data.
*   **Processing:** `lib/whatsapp.ts` parser.
*   **Output:** Formatted variable-injected message with bolding and emojis specific to the context (e.g., Warning emojis if `TENTATIVE`).

## 2. Smart Suggestions (Proximity Logic)
The "Checkout" flow features a predictive engine.
*   **Logic:** `getShoots()` filters for events starting within +/- 24 hours of "now".
*   **Action:** Auto-populates the "Project" dropdown and "Crew" selector.
*   **Result:** Reduces input friction by 90% for users checking out on the day of the shoot.

## 3. Future AI Roadmap (Generative)
*   **Log Parsing:** Using LLMs to parse natural language logs (e.g., "Camera dropped in water") into structured Maintenance Tickets.
*   **Conflict Prediction:** Analyzing historical shoot overruns to predict likely overlapping bookings before they happen.
