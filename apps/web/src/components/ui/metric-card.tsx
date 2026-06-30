
import { Card, Skeleton, Typography } from 'antd';

const { Text } = Typography;

export function MetricCard({
  eyebrow,
  value,
  caption,
  loading = false,
}: {
  eyebrow: React.ReactNode;
  value: React.ReactNode;
  caption?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="surface-border" style={{ minWidth: 240, flex: '1 1 240px' }}>
      <Text className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
        {eyebrow}
      </Text>
      {loading ? <Skeleton active paragraph={false} /> : <Text strong style={{ fontSize: 28, display: 'block' }}>{value}</Text>}
      {caption ? (
        <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
          {caption}
        </Text>
      ) : null}
    </Card>
  );
}
