# Keycloak Setup: Roles, Scopes, and Mappers

This doc explains what the `scripts/setup-realm.py` script does and why
each step is necessary. Keycloak 26.3's realm import (`realm-export.json`)
handles clients, users, and basic configuration, but several features
cannot be declared in the export and must be configured via Admin API
after import.

## The three concepts

### Client scopes

A client scope is a named bundle of protocol mappers that a client can
pull in. When a token is issued for a client, Keycloak runs every mapper
in every scope assigned to that client. The resulting claims are what
appear in the token.

| Scope | What it adds to the token |
|---|---|
| `dashboard-audience` | `aud: dashboard-service` + `realm_access.roles` |
| `admin-audience` | `aud: admin-service` |
| `organization` | `organization: ["acme"]` |
| `profile` | `given_name`, `family_name`, `preferred_username` |
| `email` | `email`, `email_verified` |

Scopes are assigned to clients as either **default** (always included) or
**optional** (only if the client requests them in the scope parameter).

### Protocol mappers

A protocol mapper is a rule that copies a piece of data into a token.
Each mapper has:
- A **type** (what data source to pull from)
- A **config** (which claim to write, which tokens to include it in)

Mappers live inside client scopes or directly on clients.

| Mapper | Type | Source → Claim |
|---|---|---|
| dashboard-service-audience | `oidc-audience-mapper` | Static value `dashboard-service` → `aud` |
| realm-roles | `oidc-usermodel-realm-role-mapper` | User's realm roles → `realm_access` |
| org-membership | `oidc-organization-membership-mapper` | User's org membership → `organization` |

### Roles

Realm roles are the authorization primitive. They appear in the token
under `realm_access` (flat array) or `realm_access.roles` (nested).
Services read them off the validated token and authorize actions.

In Tajir: `company-admin`, `tax-filer`, `viewer`.

## Why the Python script exists

### What the realm export can do

The `realm-export.json` declares: clients, users, built-in scopes
(`profile`, `email`), custom scopes (`dashboard-audience`, `admin-audience`),
roles, and groups. These are created during `start-dev --import-realm`.

### What the realm export cannot do (26.3 limitations)

1. **Organizations** — `organizationsEnabled: true` and the organizations
   array cause `"Can not update organization group"` error during import.
   Organizations must be created via Admin API after startup.

2. **Organization membership mapper** — The `oidc-organization-membership-mapper`
   requires the `organization` feature to be enabled first. It can only
   be created via API after organizations are enabled.

3. **Realm roles in access tokens** — Keycloak 26.x has a quirk where
   the built-in `oidc-usermodel-realm-role-mapper` in the `openid` scope
   doesn't reliably add `realm_access` to access tokens for custom scopes.
   The mapper must be created explicitly with `claim.name: "realm_access"`
   and `multivalued: true`.

4. **Scope assignments** — The `admin-audience` scope is created by the
   export but must be assigned to `tajir-app` as a default scope. The
   React app requests it in its scope parameter, and if it's not assigned
   to the client, Keycloak rejects the request with `invalid_scope`.

## What the script does (step by step)

### 1. Enable organizations
```
PUT /admin/realms/demo  {"organizationsEnabled": true}
```
Turns on the organizations feature for the realm. Without this, the
`/organizations` endpoints return `"Organizations not enabled"`.

### 2. Create organizations
```
POST /admin/realms/demo/organizations  {"name": "acme", ...}
POST /admin/realms/demo/organizations  {"name": "globex", ...}
```
Creates the two tenant organizations. Users will be added as members.

### 3. Add members
```
POST /admin/realms/demo/organizations/{id}/members  "<user-uuid>"
```
Adds `shubham` and `alice` to Acme, `bob` to Globex. The `organization`
claim in the token is derived from this membership.

### 4. Create organization scope
```
POST /admin/realms/demo/client-scopes  {name: "organization", mappers: [...]}
```
Creates a client scope with the `oidc-organization-membership-mapper`.
When this scope is assigned to a client, the user's organization
membership appears as `organization: ["acme"]` in the token.

### 5. Add realm roles mapper
```
POST /client-scopes/{id}/protocol-mappers/models  {name: "realm-roles", ...}
```
Adds the `oidc-usermodel-realm-role-mapper` to the `dashboard-audience`
scope. Without this mapper, `realm_access` is missing from access tokens
even though the user has realm roles assigned.

The critical config:
- `claim.name: "realm_access"` — writes to the `realm_access` claim
- `multivalued: true` — produces a JSON array `["role1", "role2"]`
- `access.token.claim: true` — includes it in access tokens

The Go services expect `realm_access` as a flat `[]string` because
Keycloak 26.x produces flat arrays when `multivalued: true` and
`claim.name` is set.

### 6. Assign scopes to clients
```
PUT /clients/{id}/default-client-scopes/{scope-id}
```
Assigns `organization` and `admin-audience` as default scopes on
`tajir-app`. Default scopes are always included — the client doesn't
need to request them explicitly (though the React app does anyway for
clarity).

## How a token gets its claims (end-to-end)

```
User logs in → Keycloak issues token for client "tajir-app"
  |
  ├─ tajir-app's default scopes: profile, email, dashboard-audience,
  │                               admin-audience, organization
  │
  ├─ profile scope mappers run:
  │    given_name → "Shubham"
  │    family_name → "Kaushal"
  │    preferred_username → "shubham"
  │
  ├─ email scope mappers run:
  │    email → "shubham@acme.com"
  │
  ├─ dashboard-audience mappers run:
  │    audience mapper → aud: "dashboard-service"
  │    realm-roles mapper → realm_access: ["company-admin", "default-roles-demo"]
  │
  ├─ admin-audience mapper runs:
  │    audience mapper → aud: "admin-service"
  │
  └─ organization mapper runs:
       org-membership → organization: ["acme"]

Result: a token with sub, aud, realm_access, organization, email, profile claims
```

## Debugging

**"Invalid scopes" error at login:**
One of the scopes requested by the React app isn't assigned to the client.
Check `tajir-app`'s default and optional client scopes in the admin console.

**Missing `realm_access` in token:**
The realm roles mapper isn't producing output. Check:
1. The mapper exists in `dashboard-audience` scope
2. Config has `claim.name: "realm_access"` and `multivalued: "true"`
3. The user actually has realm roles assigned

**Missing `organization` in token:**
1. Organizations feature is enabled on the realm
2. Organization scope exists with the membership mapper
3. Scope is assigned to the client
4. User is a member of an organization
