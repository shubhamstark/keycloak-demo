// JsonTree.tsx — collapsible JSON tree with color-coded claim annotations.
//
// Color coding:
//   green  = standard OIDC claims (sub, iss, aud, exp, iat, auth_time, azp, scope)
//   blue   = custom/realm claims (realm_access, resource_access, organization)
//   purple = profile claims (preferred_username, email, given_name, family_name)

interface Props {
  data: Record<string, any>;
}

const STANDARD_CLAIMS = new Set([
  'sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'azp', 'scope',
  'jti', 'sid', 'typ', 'alg', 'kid', 'nonce', 'at_hash', 'c_hash',
]);

const PROFILE_CLAIMS = new Set([
  'preferred_username', 'email', 'email_verified', 'given_name',
  'family_name', 'name', 'updated_at', 'picture',
]);

const CUSTOM_CLAIMS = new Set([
  'realm_access', 'resource_access', 'organization',
]);

const ANNOTATIONS: Record<string, string> = {
  sub: 'User ID — stable across sessions',
  iss: 'Issuer — must match keycloak.demo.local/realms/demo',
  aud: 'Audience — set by dashboard-audience client scope → oidc-audience-mapper',
  exp: 'Expiry — access tokens live 5 min (realm default)',
  iat: 'Issued at',
  auth_time: 'When the user last authenticated (does not move on refresh)',
  azp: 'Authorized Party — the client that obtained this token',
  scope: 'Scopes granted to this token',
  realm_access: 'Realm roles — what services authorize on',
  resource_access: 'Client-scoped roles — per-client authorization',
  organization: 'Tenant identity — which company the user belongs to',
  preferred_username: 'Login username',
  email: 'User email from profile scope',
  given_name: 'First name from profile scope',
  family_name: 'Last name from profile scope',
};

function claimColor(key: string): string {
  if (STANDARD_CLAIMS.has(key)) return '#065f46';
  if (PROFILE_CLAIMS.has(key)) return '#6b21a8';
  if (CUSTOM_CLAIMS.has(key)) return '#1e40af';
  return '#333';
}

function claimAnnotation(key: string): string | null {
  return ANNOTATIONS[key] ?? null;
}

export default function JsonTree({ data }: Props) {
  const entries = Object.entries(data);

  return (
    <div style={{
      background: '#f8fafc',
      borderRadius: 8,
      padding: 12,
      fontFamily: '"SF Mono", Monaco, "Cascadia Code", monospace',
      fontSize: 12,
      lineHeight: 1.7,
    }}>
      {entries.map(([key, value]) => {
        const color = claimColor(key);
        const annotation = claimAnnotation(key);
        const displayValue = typeof value === 'object' && value !== null
          ? JSON.stringify(value, null, 2)
          : JSON.stringify(value);

        return (
          <div key={key} style={{ marginBottom: 4 }}>
            <span style={{ color, fontWeight: 600 }}>{key}</span>
            <span style={{ color: '#94a3b8' }}>: </span>
            <span style={{ color: '#334155' }}>{displayValue}</span>
            {annotation && (
              <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 12, fontStyle: 'italic' }}>
                ← {annotation}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
