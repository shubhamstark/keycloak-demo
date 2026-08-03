#!/usr/bin/env python3
"""
Post-import realm setup for the Tajir demo.

Run after `make up` to configure organizations, members, scopes, and
client assignments that Keycloak 26.3's realm import doesn't support.

Usage:
  python3 scripts/setup-realm.py [--keycloak-url http://localhost:8080]
"""

import json
import sys
import urllib.request
import urllib.error
import urllib.parse
import argparse


class KeycloakAPI:
    """Minimal Keycloak Admin REST API client."""

    def __init__(self, base_url, realm, admin_user, admin_pass):
        self.base = base_url.rstrip("/")
        self.realm = realm
        self.admin_user = admin_user
        self.admin_pass = admin_pass
        self._token = None

    def _get_token(self):
        url = f"{self.base}/realms/master/protocol/openid-connect/token"
        body = urllib.parse.urlencode({
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": self.admin_user,
            "password": self.admin_pass,
        }).encode()
        req = urllib.request.Request(url, data=body)
        with urllib.request.urlopen(req) as resp:
            self._token = json.loads(resp.read())["access_token"]

    def call(self, method, path, body=None):
        """Call the Admin REST API. Returns (status, data)."""
        if not self._token:
            self._get_token()
        url = f"{self.base}/admin/realms/{self.realm}{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self._token}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return resp.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            body_text = e.read().decode(errors="replace")
            return e.code, {"error": body_text}


def setup(kc: KeycloakAPI):
    """Run all setup steps. Returns True on success."""

    # ---- Step 1: enable organizations ----------------------------------------
    print("[1/5] Enable organizations on realm")
    status, _ = kc.call("PUT", "", {"organizationsEnabled": True})
    if status not in (200, 204):
        print(f"  FAIL (HTTP {status}) — cannot continue")
        return False
    print("  OK")

    # ---- Step 2: create organizations ----------------------------------------
    print("\n[2/5] Create organizations")
    org_ids = {}
    for name in ["acme", "globex"]:
        status, _ = kc.call("POST", "/organizations", {
            "name": name,
            "enabled": True,
            "domains": [{"name": f"{name}.com"}],
        })
        ok = status in (200, 201)
        # Fetch the org ID (create returns no body).
        if ok:
            _, orgs = kc.call("GET", "/organizations")
            for o in orgs:
                if o.get("name") == name:
                    org_ids[name] = o["id"]
                    break
        print(f"  {name}: {'OK' if ok else 'FAIL'} ({status})")

    # ---- Step 3: add members -------------------------------------------------
    print("\n[3/5] Add members to organizations")
    _, users = kc.call("GET", "/users?briefRepresentation=true")
    uid = {u["username"]: u["id"] for u in users}

    for username, org_name in [("shubham", "acme"), ("alice", "acme"), ("bob", "globex")]:
        user_id = uid.get(username)
        org_id = org_ids.get(org_name)
        if not user_id or not org_id:
            print(f"  {username} → {org_name}: SKIP (missing user or org)")
            continue
        status, _ = kc.call("POST", f"/organizations/{org_id}/members", user_id)
        print(f"  {username} → {org_name}: {'OK' if status in (200,201) else 'FAIL'} ({status})")

    # ---- Step 4: create organization client scope ----------------------------
    print("\n[4/5] Create organization client scope")
    body = {
        "name": "organization",
        "protocol": "openid-connect",
        "attributes": {
            "include.in.token.scope": "true",
            "display.on.consent.screen": "true",
        },
        "protocolMappers": [{
            "name": "org-membership",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-organization-membership-mapper",
            "config": {
                "access.token.claim": "true",
                "id.token.claim": "true",
                "claim.name": "organization",
            },
        }],
    }
    status, data = kc.call("POST", "/client-scopes", body)
    print(f"  {'OK' if status in (200,201) else 'FAIL'} ({status})")

    # ---- Step 5: add realm roles mapper to dashboard-audience ---------------
    print("\n[5/6] Add realm roles mapper")
    _, scopes = kc.call("GET", "/client-scopes")
    dash_scope_id = None
    for s in scopes:
        if s["name"] == "dashboard-audience":
            dash_scope_id = s["id"]
            break
    if dash_scope_id:
        # Remove old mapper if it exists (idempotent).
        _, existing = kc.call("GET", f"/client-scopes/{dash_scope_id}/protocol-mappers/models")
        for m in existing:
            if m.get("name") == "realm-roles":
                kc.call("DELETE", f"/client-scopes/{dash_scope_id}/protocol-mappers/models/{m['id']}")
        # Add the realm roles mapper. Without this, realm_access.roles is
        # missing from access tokens (Keycloak 26.x built-in mapper issue).
        kc.call("POST", f"/client-scopes/{dash_scope_id}/protocol-mappers/models", {
            "name": "realm-roles",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-usermodel-realm-role-mapper",
            "config": {
                "access.token.claim": "true",
                "id.token.claim": "true",
                "userinfo.token.claim": "true",
                "multivalued": "true",
                "claim.name": "realm_access",
            },
        })
        print("  OK")
    else:
        print("  SKIP (dashboard-audience not found)")

    # ---- Step 6: assign scopes to clients ------------------------------------
    print("\n[6/6] Assign scopes to clients")
    _, clients = kc.call("GET", "/clients?clientId=tajir-app")
    client_uuid = clients[0]["id"] if clients else None

    _, scopes = kc.call("GET", "/client-scopes")
    scope_map = {s["name"]: s["id"] for s in scopes}

    for scope_name in ["organization", "admin-audience"]:
        scope_id = scope_map.get(scope_name)
        if not client_uuid or not scope_id:
            print(f"  {scope_name} → tajir-app: SKIP")
            continue
        status, _ = kc.call("PUT", f"/clients/{client_uuid}/default-client-scopes/{scope_id}")
        print(f"  {scope_name} → tajir-app: {'OK' if status in (200,204) else 'FAIL'} ({status})")

    return True


def main():
    parser = argparse.ArgumentParser(description="Tajir post-import realm setup")
    parser.add_argument("--keycloak-url", default="http://keycloak.demo.local",
                        help="Keycloak base URL (default: http://keycloak.demo.local)")
    args = parser.parse_args()

    kc = KeycloakAPI(args.keycloak_url, "demo", "admin", "admin")

    print("=== Tajir Realm Setup ===\n")
    if setup(kc):
        print("\n=== Done ===")
        print("Run: sudo minikube tunnel")
        print("Open: http://app.demo.local")
    else:
        print("\n=== FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
