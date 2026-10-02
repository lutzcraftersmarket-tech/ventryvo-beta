# Netlify beta-form webhook

The deployed Supabase Edge Function is:

`netlify-beta-form`

It accepts Netlify form-submission webhooks and copies beta tester applications into `public.beta_test_applications`.

Security:
- JWT verification is disabled because Netlify is an external webhook caller.
- The function requires a separate high-entropy webhook token.
- Only the SHA-256 hash of that token is stored in Supabase.
- The function uses Supabase's server-side secret key environment to insert data.
- The webhook token must never be committed to GitHub.

Netlify should be configured to call:

`https://hzxiljqrqmtzsksxsdyj.supabase.co/functions/v1/netlify-beta-form?token=YOUR_PRIVATE_TOKEN`

for new submissions of the `ventryvo-beta-testers` form.
