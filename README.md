# VENTRYVO

VENTRYVO is an event-management platform for craft markets, vendor events, festivals, pop-ups, farmers markets, and other vendor-based events.

## Current beta site

- Public beta tester application: `/`
- Share / printable invitation: `/invite`
- Thank-you page: `/thank-you`

## Platform direction

This repository is the starting point for the VENTRYVO SaaS platform. The backend uses Supabase with row-level security and organization-scoped data. Netlify hosts the public application site.

Core platform areas planned from this base:

- Platform owner / super-admin controls
- Organization workspaces
- User memberships and staff roles
- Events
- Vendors
- Event applications
- Bookings
- Invoices
- Payments
- Communications
- Plans and subscriptions
- Audit logging
- Beta tester review and onboarding

Payment card data must never be stored directly in the application database. A payment processor will handle card details; VENTRYVO will retain only provider/customer/transaction/subscription references and status data.

## Security model

Every customer-owned operational record is scoped to an `organization_id`. Supabase RLS policies restrict access to users who belong to that organization, while platform-admin data is separately restricted.

The public beta form is handled by Netlify Forms. Beta application records in Supabase are not anonymously readable.

## Beta

Beta participation is free.