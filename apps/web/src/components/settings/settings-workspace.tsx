import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, Flex, Result, Tabs, Typography, theme } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import {
  getSettingsSectionByKey,
  getVisibleSettingsSections,
  type SettingsSectionKey,
} from './settings-sections';

const { Text } = Typography;

export function SettingsWorkspace({
  sectionKey,
  children,
}: {
  sectionKey: SettingsSectionKey;
  children: ReactNode;
}) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const { token } = theme.useToken();

  const visibleSections = getVisibleSettingsSections(can);
  const activeSection = getSettingsSectionByKey(sectionKey);
  const firstVisibleSection = visibleSections[0] ?? null;
  const activeVisible = visibleSections.some((section) => section.key === sectionKey);

  useEffect(() => {
    if (!activeSection || !activeVisible) {
      if (firstVisibleSection && pathname !== firstVisibleSection.href) {
        navigate(firstVisibleSection.href, { replace: true });
      }
    }
  }, [activeSection, activeVisible, firstVisibleSection, navigate, pathname]);

  if (!activeSection || !activeVisible) {
    if (firstVisibleSection) {
      return null;
    }

    return (
      <Result
        status="403"
        title="No settings sections are available for this role"
        subTitle="Ask a company admin to grant access to at least one workspace settings area."
      />
    );
  }

  return (
    <Card
      variant="borderless"
      styles={{
        body: {
          padding: 16,
          background:
            'linear-gradient(180deg, rgba(94, 139, 255, 0.06), rgba(94, 139, 255, 0.02))',
        },
      }}
    >
      <Tabs
        activeKey={sectionKey}
        destroyInactiveTabPane
        tabBarGutter={10}
        onChange={(nextKey) => {
          const nextSection = getSettingsSectionByKey(nextKey as SettingsSectionKey);
          if (nextSection) navigate(nextSection.href);
        }}
        items={visibleSections.map((section) => ({
          key: section.key,
          label: (
            <Flex align="center" gap={8}>
              <span style={{ fontSize: 16, color: token.colorPrimary }}>{section.icon}</span>
              <span>{section.label}</span>
            </Flex>
          ),
          children: (
            <Flex vertical gap={20}>
              <Flex align="center" gap={12} style={{ paddingTop: 8 }}>
                <Flex
                  align="center"
                  justify="center"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: token.borderRadiusLG,
                    background: 'var(--brand-soft)',
                    color: token.colorPrimary,
                    fontSize: 18,
                  }}
                >
                  {section.key === sectionKey ? section.icon : <SettingOutlined />}
                </Flex>
                <div>
                  <Text className="eyebrow" style={{ display: 'block', marginBottom: 2 }}>
                    Workspace Settings
                  </Text>
                  <Text strong style={{ fontSize: 16 }}>
                    {section.label}
                  </Text>
                </div>
              </Flex>
              {section.key === sectionKey ? children : null}
            </Flex>
          ),
        }))}
      />
    </Card>
  );
}
