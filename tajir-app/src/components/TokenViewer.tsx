// TokenViewer.tsx — reusable decoded JWT viewer.
//
// Displays a JWT in three sections: encoded (raw), decoded header,
// and decoded payload with color-coded claims. Used by TokenInspector,
// ApiExplorer, and RefreshDemo pages.

import { useAuth } from '../auth/AuthContext';
import JsonTree from './JsonTree';

interface Props {
  token: string | null;
  label: string;
  defaultExpanded?: boolean;
}

export default function TokenViewer({ token, label, defaultExpanded = false }: Props) {
  const { decodeToken } = useAuth();

  if (!token) {
    return (
      <div style={cardStyle}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>{label}</h3>
        <p style={{ color: '#999', fontSize: 13 }}>No token available</p>
      </div>
    );
  }

  const decoded = decodeToken(token);
  const header = decoded?.header ?? {};
  const payload = decoded?.payload ?? {};

  const exp = payload.exp ? new Date(payload.exp * 1000) : null;
  const isExpired = exp ? exp < new Date() : false;
  const expiresSoon = exp && !isExpired && (exp.getTime() - Date.now() < 5 * 60 * 1000);

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15 }}>{label}</h3>
        {exp && (
          <span style={{
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 10,
            background: isExpired ? '#fee2e2' : expiresSoon ? '#fef3c7' : '#d1fae5',
            color: isExpired ? '#991b1b' : expiresSoon ? '#92400e' : '#065f46',
            fontWeight: 600,
          }}>
            {isExpired ? 'EXPIRED' : expiresSoon ? 'EXPIRES SOON' : `expires ${exp.toLocaleTimeString()}`}
          </span>
        )}
      </div>

      {/* Raw JWT */}
      <details style={{ marginBottom: 12 }} open={defaultExpanded}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: '#666', marginBottom: 4 }}>
          Raw JWT
        </summary>
        <pre style={{
          background: '#1e293b',
          color: '#e2e8f0',
          padding: 12,
          borderRadius: 8,
          fontSize: 11,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {token}
        </pre>
      </details>

      {/* Decoded Header */}
      <details style={{ marginBottom: 12 }} open={defaultExpanded}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: '#666', marginBottom: 4 }}>
          Header
        </summary>
        <JsonTree data={header} />
      </details>

      {/* Decoded Payload */}
      <details open={defaultExpanded}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: '#666', marginBottom: 4 }}>
          Payload (claims)
        </summary>
        <JsonTree data={payload} />
      </details>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 20,
  marginBottom: 16,
};
