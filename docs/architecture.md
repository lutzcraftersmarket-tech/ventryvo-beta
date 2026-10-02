# VENTRYVO Architecture

## Tenancy

VENTRYVO is designed as a multi-tenant SaaS application. All customer operational data belongs to an organization.

A user may belong to one or more organizations through `organization_memberships`.

Roles:
- owner
- admin
- manager
- staff
- read_only

## Platform administration

`platform_admins` is separate from organization memberships. Platform administrators can manage the VENTRYVO service itself, including beta applications, organizations, plans, and subscription state.

The platform-admin table is not writable by normal authenticated clients.

## Core tables

- `profiles`
- `platform_admins`
- `organizations`
- `organization_memberships`
- `events`
- `vendors`
- `event_applications`
- `bookings`
- `invoices`
- `payments`
- `communications`
- `plans`
- `subscriptions`
- `audit_log`
- `beta_test_applications`

## Security

All exposed application tables use Supabase Row Level Security.

Authenticated organization users can only read data for organizations to which they belong.

Write access is role-aware. Owners, admins, and managers have broader operational write privileges. Destructive organization-level actions are more restricted.

Platform-level billing and subscription changes are reserved for platform administration or future server-side payment webhooks.

## Payments

VENTRYVO will not store raw payment card numbers or CVV data.

A PCI-compliant payment provider will be used for:
- checkout
- recurring subscriptions
- card storage/tokenization
- payment authorization/capture

VENTRYVO stores only safe references such as:
- provider customer ID
- provider subscription ID
- provider transaction ID
- payment status
- amount
- billing period dates

## Beta applications

The current public beta application uses Netlify Forms for intake.

The Supabase `beta_test_applications` table is reserved for the private owner review workflow and future synchronization/import.

Planned owner actions:
- review
- selected
- waitlist
- decline
- notes
- create organization from selected tester
- Excel export
- PDF export

## Shareable application

The public `/invite` page provides:
- application URL
- Copy Application Link
- Print / Save as PDF

No QR code is used.
