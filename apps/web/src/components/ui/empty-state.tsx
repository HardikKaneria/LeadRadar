
import { Button, Empty, Flex, Typography } from 'antd';

const { Paragraph } = Typography;

export function EmptyState({
  title,
  description,
  action,
}: {
  title?: React.ReactNode;
  description: React.ReactNode;
  action?: {
    label: React.ReactNode;
    onClick?: () => void;
    href?: string;
  };
}) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <Flex vertical gap={8} align="center">
          {title ? <strong>{title}</strong> : null}
          <Paragraph type="secondary" style={{ margin: 0, maxWidth: 420 }}>
            {description}
          </Paragraph>
          {action ? (
            <Button type="primary" href={action.href} onClick={action.onClick}>
              {action.label}
            </Button>
          ) : null}
        </Flex>
      }
    />
  );
}
