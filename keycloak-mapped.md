# Keycloak, mapped: where OAuth and OIDC actually live

The previous two articles derived OAuth 2.0 and OpenID Connect from the problems
they solve. This one grounds all of it in a real product. If you have those two
pieces in hand, you already understand every concept Keycloak implements; what
you are missing is which concrete thing each concept becomes. So this article is
a translation exercise. Every abstract noun from the first two pieces, the
authorization server, the client, the ID token, the JWKS endpoint, turns out to
be either a URL Keycloak serves or an object you manage in an admin console. Once
you can see the mapping, Keycloak stops being a wall of unfamiliar screens and
becomes the thing you already know, with addresses attached.

Throughout, the concrete examples come from a small demo system (Keycloak plus a
web login page and two backend services, deployed on minikube) so that each
abstraction has something running behind it.

## What Keycloak is, in one sentence you can now unpack

Keycloak is an open source implementation of exactly the two things you spent two
articles deriving: an OAuth 2.0 authorization server and an OpenID Connect
provider. It speaks SAML too, but the OAuth and OIDC halves are the ones you
already understand, and they are the whole of what we will map here.

Nothing in it is conceptually new. Every abstract role becomes, in Keycloak, one
of two kinds of thing. Some become real HTTPS paths it exposes: the authorization
endpoint, the token endpoint, the userinfo endpoint, the JWKS document, the
discovery document. Others become records you create and manage through an admin
console or the Admin REST API: the client, the user, the realm, scopes, roles.
When the OAuth article said "the authorization server pins the redirect URI,"
Keycloak is the thing with a text field where that URI goes. When the OIDC
article said "the provider signs the ID token with its private key and publishes
the public half at the JWKS endpoint," Keycloak is the thing holding that keypair
and serving that endpoint.

Keycloak is also the concrete answer to the OAuth article's "why not build your
own." Everything we said you would otherwise have to rebuild, password hashing,
brute-force lockout, token signing and rotation, MFA, session management,
federation to Google or a corporate identity provider, an admin UI, is a feature
you configure rather than code you maintain. That is what "batteries included"
means here: it implements the protocol and the entire operational apparatus
around it. The rest of this article walks the mapping, starting with the physical
shape of a running Keycloak and working inward to how a single token gets its
contents.

## The runtime architecture, made concrete on Kubernetes

Physically, a Keycloak deployment is four things, and it helps to see them as
boxes before mapping them onto anything.

First, the Keycloak server itself: a Java application built on Quarkus. This is
the compute that serves the login pages, the token endpoint, and the admin
console. It is effectively stateless in that any node can handle any request.
Second, a relational database, Postgres in the demo, which is the durable source
of truth. It holds realms, clients, users, hashed credentials, roles, signing
keys, configuration, and, in current Keycloak, user sessions. Third, Infinispan,
an in-memory data grid embedded inside each Keycloak node, used to cache database
reads and to coordinate volatile state across a cluster so you are not hitting
the database on every request. Fourth, the two interfaces: the runtime OIDC and
OAuth endpoints that apps and users talk to, and the admin plane, the admin
console and the Admin REST API, used to configure everything.

One historical note will save you real confusion. Older Keycloak ran on the
WildFly application server, was configured through an XML file, and served
everything under an `/auth/` base path. Since version 17 it runs on the Quarkus
distribution, is configured with `kc.sh` and environment variables, and the
`/auth/` prefix is gone. If a guide still mentions WildFly, `standalone.xml`, or
`/auth/` URLs, it predates Keycloak 17 and is out of date. A large share of
Keycloak tutorials online are pre-17, so this is the single biggest source of
"why does this not match what I see."

Mapping those four boxes onto Kubernetes is what makes them tangible, because
each becomes a resource you can list with `kubectl get`.

<!-- IMAGE: kc-runtime-on-k8s.png -->

The Keycloak server becomes a Deployment with one or more pods, each running the
Quarkus process with its embedded Infinispan. The database becomes a StatefulSet
with a persistent volume so its state survives pod restarts, though in real
production you would often point Keycloak at a managed database instead. The two
interfaces are split at the ingress: apps and users reach the runtime OIDC
endpoints, while admins reach the console and the Admin REST API. And the
clustering detail worth knowing: when you run more than one Keycloak pod, the
pods discover each other to form a single Infinispan cluster, and on Kubernetes
that discovery is done through DNS, configured rather than coded.

One honest limitation, since the demo uses minikube: minikube is a single node,
so running two Keycloak replicas on it shows the shape of clustering without
giving you true high availability, because both replicas sit on the same
machine. That is fine for understanding the architecture. Real high availability
needs multiple nodes, and the current direction of the project (a stateless mode
that moves more volatile state into the database to simplify multi-cluster
setups) is aimed exactly at that case. It is worth knowing the direction exists;
it does not change the four-box model you configure day to day.

## The realm: the one concept with no predecessor

Almost everything in Keycloak maps back to something in the OAuth or OIDC
articles. The realm is the exception. It is the one first-class Keycloak concept
those articles never needed, and understanding it is the key to everything that
follows, because every other object lives inside a realm.

A realm is a fully isolated universe of identity. It has its own set of users,
its own clients, its own roles, and, importantly, its own signing keys. Two
realms on the same Keycloak server share nothing by default. A user in realm A
does not exist in realm B. A token signed by realm A is signed with realm A's
private key and will not validate against realm B's public keys. Each realm even
has its own login pages and its own set of endpoints. The practical mental model
is that a single Keycloak server hosts many independent authorization servers
side by side, and a realm is one of them.

<!-- IMAGE: kc-realms-isolation.png -->

This is why the endpoints you will meet in the next section all carry the realm
in their path: there is no such thing as "the token endpoint" on a Keycloak
server, only "realm demo's token endpoint." The `master` realm exists by default
and is meant only for administering Keycloak itself; you do not put application
users in it. You create a realm per security boundary and put your users and
clients there. In the demo, that realm is called `demo`, and everything, the
login-web client, the two services, the user, lives inside it.

The realm is also where the multi-tenancy question begins, and it is worth
flagging now because it returns later. If a realm is a sealed universe, then one
obvious way to serve multiple tenants is a realm per tenant, hard isolation, at
the cost of operating many realms. The other way keeps a single realm and models
tenants inside it. We come back to that tradeoff when we reach organizations; for
now, hold the realm as the outermost container that everything else sits within.

## The translation table: abstract role to Keycloak object

With the realm as the container, the rest of the mapping falls into place. Here
is the core of it, each concept from the first two articles alongside the
concrete Keycloak object it becomes.

<!-- IMAGE: kc-translation-table.png -->

The authorization server is the Keycloak server, scoped to a realm. When the
articles said "the authorization server," read "a realm on a Keycloak server."

The resource owner is a user, a record inside a realm with credentials Keycloak
stores and hashes.

The client is a Keycloak client, and this is where the public-versus-confidential
distinction from the OAuth article becomes a literal setting. A client marked
public holds no secret and is expected to use PKCE; the demo's `login-web` is
one. A client marked confidential has a secret it uses to authenticate to the
token endpoint; the demo's `music-service` is one. The redirect URIs the OAuth
article insisted must be pre-registered are a text field on the client. Whether
PKCE is required, which flows are enabled, how long its tokens live, all of it is
per-client configuration.

The resource server, the API that only validates tokens, is not a special kind of
Keycloak object at all. It is just your service, holding no secret for
request-serving, validating incoming tokens against the realm's JWKS. In the demo
both Go services play this role. Keycloak does not need to know much about a pure
resource server; it only needs to have issued the tokens the service will check.

Scopes and claims become client scopes and protocol mappers, the machinery that
decides what actually goes into a token. That machinery is important enough to get
its own section shortly.

Roles become realm roles and client roles, the authorization primitive your
services read off the validated token. Those get their own section too, alongside
groups and organizations.

The through-line is that Keycloak did not invent new concepts here. It gave each
concept a home: a record you edit, a checkbox you tick, a field you fill in. The
reason the admin console can look overwhelming is not conceptual depth, it is that
every knob from two protocols is exposed at once. Knowing which knob maps to which
idea is the whole battle, and you now have most of the map.

## Where every endpoint you learned actually lives

The OIDC article talked about the authorization endpoint, the token endpoint,
userinfo, the JWKS document, and the discovery document as abstract roles. In
Keycloak they are concrete URLs, and they all hang off the realm. For a realm
named `demo`, the pattern is:

- Authorization endpoint: `/realms/demo/protocol/openid-connect/auth`
- Token endpoint: `/realms/demo/protocol/openid-connect/token`
- Userinfo endpoint: `/realms/demo/protocol/openid-connect/userinfo`
- JWKS: `/realms/demo/protocol/openid-connect/certs`
- Logout: `/realms/demo/protocol/openid-connect/logout`

Note that the JWKS document, which the OIDC article referred to by its role, is
served at the path ending in `certs`. That is the URL your resource servers fetch
to get the realm's public keys and validate signatures locally.

The satisfying part is that you do not memorize any of these, because the
discovery document lists them all. It lives at
`/realms/demo/.well-known/openid-configuration`, and it is a real URL you can
fetch right now against the demo. It returns one JSON object naming the issuer,
every endpoint above, the `jwks_uri`, and the scopes, claims, and algorithms the
realm supports.

<!-- IMAGE: kc-discovery-endpoints.png -->

This is exactly the discovery mechanism from the OIDC article, now with concrete
values. It is also why the demo's Go services need almost no configuration to
validate tokens: you hand the OIDC library the issuer URL
(`.../realms/demo`), it fetches the discovery document, learns the `jwks_uri`,
fetches the keys, and is ready to verify. Every abstract endpoint from the
previous article is reachable from that single well-known URL.

## How a token gets its contents: client scopes and protocol mappers

The OIDC article made a point of deriving each token claim from the attack it
prevents. It left open a concrete question: how does a claim actually get into a
token? In Keycloak, claims do not appear by magic. Something puts each one there,
and that something is a protocol mapper.

A protocol mapper is a small, configured rule that copies a piece of data into a
token. It might copy a user attribute (email, a custom field) into a claim, or
copy the user's roles into the token, or add a static value. Mappers are grouped
into client scopes, reusable bundles of mappers that a client can pull in. When
a token is issued for a client, Keycloak runs the mappers from that client's
scopes, and the claims they produce are what end up in the token.

<!-- IMAGE: kc-mappers-to-claims.png -->

This is where several threads from the earlier articles become concrete
configuration. The `aud` claim, the audience check that defeated the confused
deputy in the OIDC article, is produced by an audience mapper. In the demo, a
client scope named `music-audience` carries a mapper that stamps
`aud: music-service` onto the tokens issued to `login-web`, which is precisely
what lets `music-service` accept them and reject tokens meant for anything else.
The roles that your services authorize on arrive through a roles mapper. Custom
claims your application needs are just more mappers.

Seeing this is what turns "the token has these claims" from a mystery into a
system you control. If a claim you expect is missing, a mapper is missing or a
client scope is not assigned. If a token carries data it should not, a mapper is
adding it. The token is not handed down; it is assembled, per client, from the
mappers in scope. That assembly step is the concrete home of everything the OIDC
article said a well-formed token should contain.

## Signing keys and JWKS, made concrete

The OIDC article covered signatures and JWKS in the abstract: the provider signs
with a private key, publishes the public half, and clients verify locally. In
Keycloak this maps cleanly and needs little elaboration, since you already know
the crypto.

Each realm owns its own signing keys. Keycloak generates a keypair per realm and
uses the private half to sign that realm's tokens; the public half is published
at the realm's `certs` endpoint, tagged with a key id. This is the realm
isolation from earlier showing up in the cryptography: a token is only valid
against the keys of the realm that issued it. Key rotation is a realm setting.
Keycloak can hold multiple active keys at once, so it can start signing with a
new key while tokens signed by the old key are still in flight and still
verifiable, exactly the rotation story the OIDC article described, driven by the
key id in each token's header. Your resource servers do nothing special for
rotation: they refetch the JWKS when they see an unfamiliar key id.

There is nothing to configure here to get the default behavior. It is worth
knowing only so that, when you look at a realm's keys tab in the console, you
recognize it as the concrete home of the JWKS mechanism you already understand.

## Roles, groups, and organizations

Authorization and multi-tenancy in Keycloak rest on three concepts that are easy
to conflate, so it is worth stating what question each answers. Roles answer what
a user may do. Groups answer how to bundle users so you can assign roles in bulk.
Organizations answer which tenant a user belongs to. They operate at different
layers and are not substitutes for one another.

<!-- IMAGE: kc-roles-groups-orgs.png -->

Roles are the authorization primitive, and they are what your services actually
read. Realm roles are global to the realm; client roles are scoped to a specific
client, so the same user can be an administrator in one client and an ordinary
user in another, which is the per-client authorization idea from the OIDC article
made concrete. Composite roles bundle other roles, so assigning one role can
grant several. Roles reach your services the way any claim does, through a mapper,
landing under `realm_access.roles` and `resource_access.<client>.roles` in the
token. Your service reads them off the validated token and authorizes on them.

Groups are a management convenience, not an authorization concept. A group is a
container of users that carries role mappings, and groups are hierarchical. You
assign roles to a group, and members inherit them. The important correction is
that services should generally authorize on roles, not on group membership: the
group is how you assign roles in bulk, and what flows to the service and gets
checked is still the roles. Put a user in a group, the user gains the group's
roles, the roles land in the token, the service checks the roles. Groups sit one
level above roles as a way to manage them.

Organizations are the newest of the three and the direct answer to the realm's
multi-tenancy question. Introduced as a preview in Keycloak 25 and generally
available since Keycloak 26, an organization represents a tenant that lives inside
a single realm. The architectural shift is that users exist in the realm while
organizations are a membership layer on top, so a single user can belong to more
than one organization, which is what business-to-business products need. Each
organization can have its own identity provider (a customer's corporate SSO) and
its own domain-based login routing. Organization context does not reach your token
by default; you request the `organization` scope to get the organization id and
attributes into the token, so your service knows which tenant the user is acting
as.

This reframes the multi-tenancy tradeoff from the realm section. A realm per
tenant gives hard isolation, separate keys and separate everything, at the cost
of operating many realms, where whole-cluster operations grow with the realm
count. Organizations keep a single realm and model tenants inside it, which scales
to many tenants cheaply and suits shared-user business-to-business cases, at the
cost of softer isolation. The rule of thumb: reach for organizations unless you
genuinely need per-tenant cryptographic and operational isolation, in which case
reach for realms. One further note if you are on an older 26.x: per-tenant
hierarchical groups inside an organization arrived in Keycloak 26.6, so before
that you model intra-tenant structure with roles or attributes rather than
organization-scoped groups.

## Multi-tenancy and delegated administration

The realm and organization concepts set up a question every business-to-business
product eventually faces: your product serves many companies, each company has
its own users, and each company needs to manage roles for its own people without
being able to touch anyone else's. This section is how that works concretely.

Start with the tenant model. As established earlier, a company is an
organization: many tenants inside a single realm, users existing at the realm
level with organization membership on top. This is the model that scales to many
companies cheaply, and it is what puts the tenant identity into the token, which
is the first half of the solution. Here is a decoded user access token in this
model, the thing your services actually read on each request:

```json
{
  "sub": "f7c2a1e0-9b3d-4a55-8c21-1e0d7a9b3c44",
  "preferred_username": "alice@acme.com",
  "aud": "music-service",
  "iss": "https://auth.example.com/realms/demo",
  "exp": 1735689600,
  "organization": {
    "acme": { "id": "org-acme-001" }
  },
  "realm_access": {
    "roles": ["default-roles-demo", "listener"]
  },
  "resource_access": {
    "music-service": { "roles": ["library:read"] }
  }
}
```

Two things travel together here. The `organization` claim says which company the
user belongs to (present because the client requested the `organization` scope),
and the role claims say what they may do. Your service reads both: it scopes data
to the company from `organization`, and it authorizes the action from
`realm_access.roles` and `resource_access.<client>.roles`. Tenant and permission,
in one validated token.

Now the harder half: how does a company admin at Acme assign the `library:read`
role to a colleague, without any ability to affect a different company? The wrong
answer is to hand each company direct Keycloak admin access, that would let them
see and change the whole realm. The right answer for most products is to keep
Keycloak behind your own backend.

<!-- IMAGE: kc-delegated-admin-architecture.png -->

The architecture is a three-hop chain. The company admin uses your product's own
team-management UI, which shows only their company's users and only the roles you
allow them to assign. That UI calls your backend, not Keycloak. Your backend
holds a service account (a confidential client using the client credentials grant
from the OAuth article) that has permission to manage users and role mappings in
the realm. Before it makes any change, your backend enforces the tenant boundary
in code: is this caller an admin of Acme, and is the target user also a member of
Acme? Only if both hold does it call Keycloak's Admin REST API to make the change.

The critical design point is where the boundary is enforced. Keycloak's Admin API,
called with your service account, can touch every user in the realm; it does not
by itself know that Acme's admin may only manage Acme's users. So your backend is
the gate. That is deliberate, and it is what most business-to-business products do,
because it gives you three things: control over exactly which roles a company may
assign (you expose a curated catalog, so no company can grant itself a
platform-level role), your own audit log of who changed what, and a UI that is
your product rather than Keycloak's admin console.

The Admin REST API calls your backend makes, after the tenant check passes, are
small and stable:

```
# list assignable realm roles (your backend filters to the company's allowed set)
GET  /admin/realms/demo/roles

# assign or remove a realm role on a user
POST   /admin/realms/demo/users/{userId}/role-mappings/realm
DELETE /admin/realms/demo/users/{userId}/role-mappings/realm

# assign a client-scoped role
POST /admin/realms/demo/users/{userId}/role-mappings/clients/{clientUuid}
```

Your backend authenticates these calls with its service account. That token is
itself worth seeing, because it is visibly different from a user token, it
represents a service, not a person:

```json
{
  "sub": "service-account-admin-backend",
  "aud": "realm-management",
  "iss": "https://auth.example.com/realms/demo",
  "azp": "admin-backend",
  "realm_access": {
    "roles": ["manage-users", "view-users", "query-users"]
  }
}
```

There is no `preferred_username` of a human and no `organization`, because no user
is involved. The subject is the service account itself, `azp` names the calling
client, and the roles are Keycloak's own management roles (`manage-users` and
friends) that authorize it to call the Admin API. This is the machine-to-machine
identity from the OAuth article doing real work: your backend proves it is itself,
and Keycloak lets it manage users, while your code decides which users.

It is worth naming the Keycloak-native alternative honestly, because it exists and
is improving fast. Fine-Grained Admin Permissions (V2, from Keycloak 26.2) let you
scope admin rights to specific users, groups, or roles, and from Keycloak 26.7
organizations became a first-class resource in that system, so you can grant a
delegated admin management of one organization and not others, enforced by
Keycloak itself rather than your backend. That is a genuine option, and for some
teams it is the right one. The reasons to still prefer the backend-enforced
pattern are control and version-independence: you own the assignable-role catalog
and the UX, and it works on any Keycloak version. A common belt-and-suspenders
setup uses both, your backend enforces product rules, and Fine-Grained Admin
Permissions enforce the hard tenant boundary underneath, so a bug in your backend
still cannot cross tenants at the Keycloak level.

One thing this pattern also enables is service-to-service calls that stay
tenant-aware, which is where token exchange from the OAuth article earns its keep.
When your backend calls a downstream service on behalf of a logged-in user, it can
exchange the user's token for one targeted at the downstream service, and the
result preserves the user, and therefore the tenant, rather than flattening to a
service identity:

```json
{
  "sub": "f7c2a1e0-9b3d-4a55-8c21-1e0d7a9b3c44",
  "aud": "recommendation-service",
  "iss": "https://auth.example.com/realms/demo",
  "azp": "music-service",
  "organization": {
    "acme": { "id": "org-acme-001" }
  },
  "realm_access": { "roles": ["listener"] }
}
```

The `sub` is still the original user and the `organization` claim still says Acme,
so the downstream service knows exactly which user and which tenant it is acting
for, while `azp` records that `music-service` made the call. Contrast this with the
service-account token above, where the user is gone entirely. That is the whole
choice token exchange gives you: carry the user and tenant forward, or act as the
service. Both are valid; they answer different questions, and in a multi-tenant
system the token-exchange path is often what you want, because losing the tenant
downstream is how data leaks across companies.

## Sessions, refresh, and token lifespans

The OIDC article drew a careful line between the ID token, which proves a login
happened, and a session, which remembers it. Keycloak sits on the server side of
that line, and its sessions are what make single sign-on work.

When a user logs in to a realm, Keycloak creates a server-side SSO session for
that user, held in the realm and, in current Keycloak, persisted to the database.
That session is what lets a second client in the same realm skip the login form
entirely: the user is already authenticated to the realm, so Keycloak issues
tokens to the new client without re-prompting. That is single sign-on, and it is
a property of the Keycloak session, not of any token. The ID token each client
receives is still the login-moment snapshot from the OIDC article; the durable
"this user is logged in to the realm" fact lives in the session on the server.

This connects back to the runtime architecture. Sessions are part of the volatile
state coordinated through Infinispan and, now, persisted in the database, which is
why session handling is entangled with the clustering and high-availability story.
The current direction of the project, moving more of that volatile state into the
database so multi-cluster deployments are simpler, is largely about making
sessions behave well across sites. You do not need to configure any of this to get
working single sign-on in one cluster; it matters when you scale out, and it is
the concrete reason the "where it is heading" note from the architecture section
exists.

Refresh is where that session becomes visible to your clients, and it is worth
being precise because a common expectation is wrong: there is no separate refresh
endpoint. Refreshing a token is a POST to the same token endpoint you already
know, distinguished only by its grant type.

```
POST /realms/demo/protocol/openid-connect/token
  grant_type=refresh_token
  refresh_token=eyJ...
  client_id=login-web
```

Back comes a fresh access token, usually a new refresh token, and, as long as the
`openid` scope is in play, often a new ID token. That refreshed ID token still
describes the original login, its `auth_time` does not move, because no new
authentication happened; treat it as refreshed claims, not proof of a fresh login.

Keycloak rotates refresh tokens by default. Each refresh invalidates the old
refresh token and issues a new one, which is the reuse-detection idea from the
OAuth article made real: if an already-used refresh token is presented again,
Keycloak can treat it as theft and revoke the session. The practical consequence
for your client is simple and easy to get wrong: always store the newest refresh
token from each response and discard the previous one.

<!-- IMAGE: kc-refresh-cycle.png -->

The lifespans that govern all of this are realm settings, and there are two clocks,
not one. The access token lifespan (default five minutes) controls how long an
access token is valid, kept short so a leak expires fast. The SSO session idle and
SSO session max (defaults thirty minutes and ten hours) govern the session behind
the refresh token: idle kills it if unused, max caps it regardless of activity.
The refresh token has no independent expiry of its own; its real lifetime is
bounded by the session. Each successful refresh resets the idle clock but cannot
push past the max, so "how long can a user stay signed in without re-authenticating"
is really the SSO session max.

In your realm export these are top-level fields, in seconds, and you saw one of
them already:

```json
{
  "accessTokenLifespan": 300,
  "ssoSessionIdleTimeout": 1800,
  "ssoSessionMaxLifespan": 36000,
  "revokeRefreshToken": true,
  "refreshTokenMaxReuse": 0
}
```

A single client can override the access token lifespan through a client attribute
if it needs longer- or shorter-lived tokens than the realm default. And the
deliberate way to end refresh entirely is not to wait for expiry but to destroy
the session: the logout endpoint
(`/realms/demo/protocol/openid-connect/logout`) ends the SSO session, and the
revoke endpoint (`.../revoke`) invalidates a specific token. This is the concrete
payoff of Keycloak keeping a server-side session behind the refresh token: it can
revoke, log out, and enforce a hard maximum centrally, the control a pure stateless
JWT approach cannot offer. The refresh token is really a handle to that
server-side session, which is exactly why the session exists.

## The extension model, briefly

One last piece of the architecture is worth naming because it explains how
Keycloak stretches to cases the defaults do not cover: almost every moving part is
pluggable through a service provider interface, an SPI. You do not usually think
about SPIs, because the built-in providers cover most needs, but knowing the seams
exist tells you where customization goes.

The parts you can swap include authenticators (the steps in a login flow, which is
how a custom SMS one-time-password factor is added, since Keycloak has no built-in
SMS OTP), protocol mappers (custom claims beyond the built-in ones), and user
storage (federating an existing user database or directory instead of storing
users in Keycloak). Each plugs into the same machinery the built-ins use, so a
custom authenticator appears in the flow editor exactly like a built-in one. The
takeaway for an architecture article is not how to write an SPI, but that the
extension points are first-class: when you hit something Keycloak does not do out
of the box, the answer is usually a provider at one of these seams, not a fork.

## What this sets up

With the architecture and the mapping in hand, the practical Keycloak topics stop
being mysterious and become configuration on concepts you already understand. A
username-and-password login is the authorization code flow you know, pointed at a
realm's endpoints. Multi-tenancy is the realm-versus-organizations choice from
section eight. Service-to-service calls are the client credentials grant and token
exchange from the OAuth article, configured on a confidential client. Multi-factor
authentication is an authenticator added to a login flow, built in for
authenticator-app one-time passwords, a custom provider for SMS. Each of those is
its own walkthrough, and each now has a conceptual home rather than being a
sequence of admin clicks to copy blindly.

That is the point of treating Keycloak as a translation of OAuth and OIDC rather
than a new system to learn. The two protocols gave you the concepts. Keycloak
gives each concept an address: a URL it serves or a record you edit. The demo
system, a login page, two services, and Keycloak on minikube, is where you can
watch every one of these mappings run at once, from the browser's PKCE login to a
service exchanging a user's token for a downstream call. Access, then identity,
then a concrete place for both to live. That is the arc these three articles were
built to walk.
