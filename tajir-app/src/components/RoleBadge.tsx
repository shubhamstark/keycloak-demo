// RoleBadge.tsx — colored pill for displaying role names.

interface Props {
  role: string;
}

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  'company-admin': { bg: '#dbeafe', text: '#1e40af' },
  'tax-filer': { bg: '#d1fae5', text: '#065f46' },
  'viewer': { bg: '#f1f5f9', text: '#475569' },
  'default-roles-demo': { bg: '#f1f5f9', text: '#64748b' },
};

export default function RoleBadge({ role }: Props) {
  const colors = ROLE_COLORS[role] ?? { bg: '#f1f5f9', text: '#334155' };

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: colors.bg,
      color: colors.text,
      marginRight: 6,
      marginBottom: 4,
    }}>
      {role}
    </span>
  );
}
