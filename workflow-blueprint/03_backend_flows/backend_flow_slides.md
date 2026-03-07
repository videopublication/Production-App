# Slide 4: Data Request Lifecycle

## Purpose
Explain how a user request travels through the system, highlighting security (RLS) and the role of Supabase.

## Visual Layout
*   **Layout:** Vertical "Stack" Diagram.
*   **Style:** Isometric Block Diagram.

## Key Elements
1.  **Top Block:** Client Request (with JWT Token).
2.  **Middle Block:** Next.js Edge Middleware (The Gatekeeper).
3.  **Bottom Block:** Postgres Database (Supabase).
4.  **surrounding Bottom Block:** A Shield icon representing "RLS Policies".

## Labels / Callouts
*   **Middleware:** "Auth Verification"
*   **Supabase:** "Row Level Security (RLS)"
*   **Return Path:** "JSON Response"

## AI Image Prompt
An isometric technical diagram on a dark background.
Top layer is a glass pane labeled "Client Request".
Middle layer is a filter mesh labeled "Edge Middleware".
Bottom layer is a solid database block labeled "Postgres / Supabase".
Surrounding the bottom layer is a glowing shield wireframe labeled "RLS Security".
Show a data beam traveling down through the layers and a green success beam traveling back up.
Cyber-security aesthetic, neon blue and purple accents.
