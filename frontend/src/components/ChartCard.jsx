import { Card, EmptyState } from './ui.jsx';
import { BarChart3 } from 'lucide-react';

// One palette for every chart so the dashboards read as one system.
// Neon purple theme: primary = neon purple, secondary = electric cyan.
export const COLORS = {
  teal: '#b026ff',
  violet: '#00cfe8',
  amber: '#e8932b',
  red: '#dc4c4c',
  blue: '#3b82c4',
  slate: '#94a3b8',
};
export const SERIES = [COLORS.teal, COLORS.violet, COLORS.amber, COLORS.blue, COLORS.red, COLORS.slate];

export const AXIS = { fontSize: 12, fill: '#64748b' };
export const GRID = '#e6defa';
export const TOOLTIP_STYLE = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 };

export default function ChartCard({ title, subtitle, data, children, height = 260 }) {
  const empty = !data || data.length === 0;
  return (
    <Card title={title} subtitle={subtitle}>
      {empty ? (
        <EmptyState icon={BarChart3} title="No data yet" description="Charts fill in as people use the app for the selected filters." />
      ) : (
        <div style={{ height }} role="img" aria-label={title}>
          {children}
        </div>
      )}
    </Card>
  );
}
