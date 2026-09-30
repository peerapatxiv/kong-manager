# Live consumers and credentials (Primate port, step 2c-1)

## Context

Step 2c of the Primate port is split in two: **2c-1 consumers and credentials (this spec)** and 2c-2 plugins (schema-driven forms, scoped globally, to a service, a route or a consumer). Earlier steps this builds on:

- `2026-09-30-admin-api-foundation-design.md`: the Admin API client, `ENTITY_RESOURCES`, `createEntityClient` and the `connection` store.
- `2026-09-30-live-shell-services-routes-design.md`: the Live section, `useLiveEntities`, `LiveGate`, `LiveErrorBanner`, `FieldError`, the list-and-form view pattern (`LiveServicesView`) and the form-module pattern (`serviceForm.ts`).

Primate's behaviour is ported from `controllers/consumer-edit.js`, `consumer-list.js` and `models/user-auth-model.js`. Its Angular views are not ported.

## Current state

- `ENTITY_RESOURCES.consumers` exists (defaults `username`, `custom_id`, `tags`). There are no credential resources.
- `createEntityClient` already supports nested resources through `:parentId` path templates; list, create and remove on a nested path work (`upstreams/:parentId/targets`, `services/:parentId/routes`).
- `useLiveEntities(resource, { parentId })` accepts a string or getter parent id and uses the plain resource for every call.
- `SecretField` is an eye-toggle password input; `ValueListEditor` edits a list of strings; `TagInput`, `ToggleSwitch`, `LiveErrorBanner` and `FieldError` exist.
- The sidebar's LIVE group appears only when a connection exists and links to Services and Routes.

## Goals

- Live consumers: list, search, create, edit, delete, with Primate's username-or-custom-id rule.
- For a saved consumer, manage its credentials of six types: key-auth, basic-auth, oauth2, hmac-auth, jwt, acls. Create and delete (Primate does not edit).
- One data-driven credential panel, so a further credential type is a descriptor, not a component.

## Non-goals

- Plugins, including plugins scoped to a consumer (2c-2).
- Editing an existing credential (create and delete only, as in Primate).
- Listing credentials across all consumers.
- Changes to Browse, Compare, Load, services or routes.

## Design

### 1. Navigation

- Router: `/live/consumers` renders `LiveConsumersView`.
- Sidebar: the LIVE group gains a Consumers link after Routes (`liveLinks` gets a third entry). The page title for the route is "Live consumers".

### 2. Registry: credential resources

`EntityResourceName` and `ENTITY_RESOURCES` gain six nested resources (`nested: true`), keyed by these names with these paths:

| Resource name | Path |
|---|---|
| `key_auth` | `consumers/:parentId/key-auth` |
| `basic_auth` | `consumers/:parentId/basic-auth` |
| `oauth2_credentials` | `consumers/:parentId/oauth2` |
| `hmac_auth` | `consumers/:parentId/hmac-auth` |
| `jwt_credentials` | `consumers/:parentId/jwt` |
| `acls` | `consumers/:parentId/acls` |

Each has `defaults: {}`; the credential descriptors below own field defaults. The existing registry test that lists the collections is updated to the new total (sixteen).

### 3. Consumer form module: `src/lib/live/consumerForm.ts`

- `type ConsumerForm = { username: string; custom_id: string; tags: string[] }`.
- `fromEntity(entity)`, `newConsumerForm()` (from `ENTITY_RESOURCES.consumers.defaults`).
- `validateConsumer(form): string[]`: if both `username` and `custom_id` are blank after trimming, `['Please provide either a username or a custom ID.']`.
- `toPayload(form, mode: 'create' | 'update')`: trims strings; tags cleaned (trimmed, blanks dropped). On update a blank `username` or `custom_id` is sent as `null` so it clears on the server. On create, `null` values are omitted entirely.

### 4. Credential descriptors: `src/lib/live/credentials.ts`

Pure module. `type CredentialField = { key: string; label: string; kind: 'text' | 'secret' | 'number' | 'boolean' | 'select' | 'list' | 'textarea'; required?: boolean; options?: readonly string[]; help?: string }`.
`type CredentialType = { id: CredentialTypeId; label: string; resource: EntityResourceName; fields: CredentialField[]; summaryKeys: string[] }` with `CredentialTypeId = 'key-auth' | 'basic-auth' | 'oauth2' | 'hmac-auth' | 'jwt' | 'acls'`. Exports: `CREDENTIAL_TYPES`, `credentialType(id)`, `newCredentialForm(type)`, `validateCredential(type, form)`, `toCredentialPayload(type, form)`.

Fields per type (from Primate's `user-auth-model.js`, with Kong's requirements):

- **key-auth**: `key` (secret, optional: blank lets Kong generate one), `ttl` (number, optional), `tags` (list). Summary: `key`.
- **basic-auth**: `username` (text, required), `password` (secret, required), `tags`. Summary: `username`.
- **oauth2**: `name` (text, required), `client_id` (text, optional), `client_secret` (secret, optional), `client_type` (select `confidential` / `public`, optional), `hash_secret` (boolean), `redirect_uris` (list), `tags`. Summary: `name`, `client_id`.
- **hmac-auth**: `username` (text, required), `secret` (secret, optional), `tags`. Summary: `username`.
- **jwt**: `algorithm` (select `HS256`, `HS384`, `HS512`, `RS256`, `ES256`, default `HS256`), `key` (text, optional), `secret` (secret, optional), `rsa_public_key` (textarea, optional), `tags`. Summary: `key`, `algorithm`.
- **acls**: `group` (text, required), `tags`. Summary: `group`.

Rules:
- `newCredentialForm(type)` returns each field's default: `''` for text, secret, select and textarea (jwt `algorithm` defaults to `HS256`), `''` for number, `false` for boolean, `[]` for list.
- `validateCredential` reports `<Label> is required.` for each blank required field (trimmed).
- `toCredentialPayload` trims strings, omits blank strings and blank numbers, omits empty lists (except `tags`, which is sent only when non-empty), includes booleans only when `true`, and never sends `null` (credentials are create-only).

### 5. Views and components

- **`LiveConsumersView.vue`** follows `LiveServicesView`: list panel with search (username, custom ID, tags), tag filter through the API, Load more, New; detail panel with `ConsumerForm`, Save, Discard, Delete, dirty indicator, `onBeforeRouteLeave` guard, `LiveGate`, `LiveErrorBanner`. List label: `username`, else `custom_id`, else the first eight characters of the id. Delete confirms with "Delete this consumer? Its credentials are deleted too."
- **`ConsumerForm.vue`**: fieldset (disabled when not writable) with username, custom ID and `TagInput` tags, using `FieldError` for Kong field errors.
- **`CredentialsPanel.vue`**: props `{ consumerId: string; disabled?: boolean }`. A tab per credential type showing a count once that type has loaded. Only the active tab's section is mounted, so a type loads when first opened.
- **`CredentialSection.vue`**: props `{ consumerId: string; type: CredentialType; disabled?: boolean }`. Uses `useLiveEntities(type.resource, { parentId: () => props.consumerId })`. It shows the rows (summary fields, with `secret` summary values masked and an eye toggle per row, created time not shown), a per-row delete with `window.confirm('Delete this credential?')`, and an add form built from `type.fields`: text, secret (`SecretField`), number, boolean (`ToggleSwitch`), select, list (`ValueListEditor`), textarea. Add validates with `validateCredential`, posts `toCredentialPayload`, then clears the form. Errors show through `LiveErrorBanner`. The panel resets when the consumer changes.
- The credentials panel renders only for a saved consumer (not in create mode).
- Gating: when `!connection.canWrite`, New, Save, Delete, add and credential delete controls are disabled and inputs are inside a disabled fieldset; the DB-less notice comes from `LiveGate`.

### 6. Testing

Vitest, repo style, no new dependencies.

- `consumerForm.test.ts`: required rule (empty, whitespace-only, only username, only custom ID), null on update and omission on create, trimming, tags, `fromEntity` round trip.
- `credentials.test.ts`: every type's required fields and messages, default forms (jwt `HS256`, booleans, lists), payload rules per field kind (blank omitted, `hash_secret` only when true, tags only when non-empty, numbers), and a check that every descriptor's `resource` exists in `ENTITY_RESOURCES` as a nested resource.
- Registry tests updated (sixteen collections; nested credential paths with an encoded parent id).
- `LiveConsumersView.test.ts` (jsdom, stubbed `fetch`): disconnected prompt; DB-less read-only (every write control disabled); list, search and tag filter; create (POST, no nulls), edit (PATCH), delete (confirm and cancel); validation banner; Kong field errors; discard and navigation prompts; credentials panel absent in create mode and present for a saved consumer.
- Credentials tests in the same view test file: opening a tab loads `GET /consumers/<id>/key-auth`; adding a key-auth credential POSTs to that path with only the filled fields; a required-field failure blocks the request with a banner; deleting asks first and calls `DELETE /consumers/<id>/key-auth/<cred id>`; secret values are masked until revealed; the panel resets when switching consumer.
- Sidebar test: the Consumers link appears under LIVE when connected.
- No browser check is possible in this session; the final report says so.

## Error handling summary

| Situation | Result |
|---|---|
| No connection | Connect prompt (`LiveGate`) |
| DB-less Kong | Notice; all write controls disabled |
| Neither username nor custom ID | Banner; Save blocked; no request |
| Credential missing a required field | Banner in that section; no request |
| Kong 400 with `fields` | Banner plus per-field message; form stays open |
| Other Kong or network errors | Banner with the message; form stays open |
| Deleting a consumer | Kong removes its credentials; the list drops the consumer locally |

## Open questions

None.
