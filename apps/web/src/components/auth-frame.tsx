
import { RadarChartOutlined } from '@ant-design/icons';
import { Card, Flex, Grid, Typography, theme } from 'antd';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const HIGHLIGHTS = [
  'Capture opportunities from anywhere — manual, CSV, and browser.',
  'Triage a clean signal inbox instead of drowning in noise.',
  'Always know the single next move that wins revenue.',
];

/** Branded split-screen frame for the auth pages: radar brand panel + centered form card. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  const screens = useBreakpoint();
  const { token } = theme.useToken();
  const showBrand = screens.lg;

  return (
    <Flex className="radar-canvas" style={{ minHeight: '100vh' }}>
      {showBrand && (
        <Flex
          vertical
          justify="space-between"
          style={{
            width: '46%',
            padding: 48,
            borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Flex align="center" gap={12}>
            <RadarChartOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
            <Text className="font-display" strong style={{ fontSize: 20 }}>
              Radar <Text type="secondary" style={{ fontWeight: 400 }}>OIP</Text>
            </Text>
          </Flex>

          <div style={{ maxWidth: 500 }}>
            <Text className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>
              Opportunity Intelligence Platform
            </Text>
            <Title level={2} style={{ marginBottom: 16 }}>
              Calm, high-signal workflow for teams chasing the right revenue.
            </Title>
            <Text type="secondary" style={{ fontSize: 15 }}>
              Radar is not a CRM dashboard. It is an operator console for capturing, triaging,
              and acting on the next opportunity with the highest chance to convert.
            </Text>

            <Flex vertical gap={12} style={{ marginTop: 32 }}>
              {HIGHLIGHTS.map((line) => (
                <Flex key={line} align="flex-start" gap={10}>
                  <span
                    style={{
                      marginTop: 7,
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: token.colorPrimary,
                      flex: 'none',
                    }}
                  />
                  <Text type="secondary">{line}</Text>
                </Flex>
              ))}
            </Flex>
          </div>

          <Text type="secondary" style={{ fontSize: 12 }}>
            © {new Date().getFullYear()} Radar OIP
          </Text>
        </Flex>
      )}

      <Flex align="center" justify="center" flex={1} style={{ padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <Card className="surface-border" styles={{ body: { padding: 28 } }}>
            {children}
          </Card>
        </div>
      </Flex>
    </Flex>
  );
}
