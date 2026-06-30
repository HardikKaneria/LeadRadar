
import { Flex, Typography } from 'antd';

const { Title, Text } = Typography;

/** Standard page header block: display title + one-line subtitle + optional right-aligned action. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  extra,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <Flex align="flex-start" justify="space-between" gap={20} wrap>
      <div style={{ minWidth: 0, maxWidth: 760 }}>
        {eyebrow ? (
          <Text className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
            {eyebrow}
          </Text>
        ) : null}
        <Title level={3} style={{ margin: 0, fontSize: 30, lineHeight: 1.08 }}>
          {title}
        </Title>
        {subtitle && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
            {subtitle}
          </Text>
        )}
      </div>
      {extra && <Flex gap={8} align="center" wrap>{extra}</Flex>}
    </Flex>
  );
}
