
import { Card, Flex, Typography, type CardProps } from 'antd';

const { Text, Title, Paragraph } = Typography;

interface PageSectionProps extends Omit<CardProps, 'title' | 'extra'> {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  footer?: React.ReactNode;
  bodyStyle?: React.CSSProperties;
}

export function PageSection({
  eyebrow,
  title,
  subtitle,
  extra,
  footer,
  bodyStyle,
  children,
  ...props
}: PageSectionProps) {
  return (
    <Card
      className="surface-border"
      styles={{
        body: {
          padding: 20,
          ...bodyStyle,
        },
      }}
      {...props}
    >
      {eyebrow || title || subtitle || extra ? (
        <Flex align="flex-start" justify="space-between" gap={16} wrap style={{ marginBottom: 16 }}>
          <div style={{ minWidth: 0, flex: '1 1 360px' }}>
            {eyebrow ? (
              <Text className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
                {eyebrow}
              </Text>
            ) : null}
            {title ? (
              <Title level={5} style={{ margin: 0 }}>
                {title}
              </Title>
            ) : null}
            {subtitle ? (
              <Paragraph type="secondary" style={{ margin: title ? '6px 0 0' : 0 }}>
                {subtitle}
              </Paragraph>
            ) : null}
          </div>
          {extra ? <Flex align="center" gap={8} wrap>{extra}</Flex> : null}
        </Flex>
      ) : null}

      {children}

      {footer ? (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>{footer}</div>
      ) : null}
    </Card>
  );
}
