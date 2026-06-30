
import { Button, Flex, Typography } from 'antd';

const { Text } = Typography;

export function SettingsSaveBar({
  dirty,
  saving,
  message,
  onReset,
  onSave,
  saveLabel = 'Save changes',
}: {
  dirty: boolean;
  saving?: boolean;
  message: React.ReactNode;
  onReset?: () => void;
  onSave: () => void;
  saveLabel?: React.ReactNode;
}) {
  if (!dirty) return null;

  return (
    <div
      className="surface-border"
      style={{
        position: 'sticky',
        bottom: 16,
        zIndex: 5,
        borderRadius: 14,
        background: 'rgba(17, 23, 21, 0.92)',
        backdropFilter: 'blur(10px)',
        padding: 14,
      }}
    >
      <Flex align="center" justify="space-between" gap={16} wrap>
        <Text type="secondary">{message}</Text>
        <Flex gap={8} wrap>
          {onReset ? (
            <Button onClick={onReset} disabled={saving}>
              Reset
            </Button>
          ) : null}
          <Button type="primary" loading={saving} onClick={onSave}>
            {saveLabel}
          </Button>
        </Flex>
      </Flex>
    </div>
  );
}
