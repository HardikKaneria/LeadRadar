import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, Form, Input, InputNumber, Space, Tag, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { useAppData } from '../contexts/app-data-context'
import { formatScoringConfigSummary } from '../lib/lead-ui'

interface SettingsFormValues {
  hotLeadThreshold: number
  rules: Array<{
    keyword: string
    score: number
  }>
}

export function SettingsPage() {
  const [form] = Form.useForm<SettingsFormValues>()
  const [saving, setSaving] = useState(false)
  const { displayName, profile, saveScoringConfig, scoringConfig } = useAppData()

  useEffect(() => {
    form.setFieldsValue({
      hotLeadThreshold: scoringConfig.hotLeadThreshold,
      rules: scoringConfig.rules,
    })
  }, [form, scoringConfig])

  async function handleSubmit(values: SettingsFormValues) {
    setSaving(true)

    try {
      await saveScoringConfig({
        hotLeadThreshold: values.hotLeadThreshold,
        rules: values.rules,
      })
      message.success('Settings saved.')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>
            Configure LeadRadar preferences for Hkrafted’s freelance lead tracking workflow.
          </p>
        </div>
        <Tag color="processing">{formatScoringConfigSummary(scoringConfig)}</Tag>
      </div>

      <Card className="surface-card" title="Workspace profile">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="User">{displayName}</Descriptions.Item>
          <Descriptions.Item label="Role">{profile?.role ?? 'sales'}</Descriptions.Item>
          <Descriptions.Item label="Access">
            {profile?.is_active === false ? 'Inactive' : 'Active'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card className="surface-card" title="Lead Scoring Preferences">
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => void handleSubmit(values)}
        >
          <Form.Item
            label="Hot lead threshold"
            name="hotLeadThreshold"
            rules={[{ required: true, message: 'Set a hot lead threshold.' }]}
          >
            <InputNumber max={100} min={0} style={{ width: 220 }} />
          </Form.Item>

          <Form.List name="rules">
            {(fields, { add, remove }) => (
              <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
                {fields.map((field) => (
                  <div key={field.key} className="settings-rule-row">
                    <Form.Item
                      label="Keyword"
                      name={[field.name, 'keyword']}
                      rules={[{ required: true, message: 'Enter a keyword.' }]}
                    >
                      <Input placeholder="react, dashboard, saas" />
                    </Form.Item>
                    <Form.Item
                      label="Score"
                      name={[field.name, 'score']}
                      rules={[{ required: true, message: 'Add a score.' }]}
                    >
                      <InputNumber max={100} min={-100} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label=" ">
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                      />
                    </Form.Item>
                  </div>
                ))}
                <Button
                  icon={<PlusOutlined />}
                  type="dashed"
                  onClick={() => add({ keyword: '', score: 10 })}
                >
                  Add keyword rule
                </Button>
              </Space>
            )}
          </Form.List>

          <Space style={{ marginTop: 24 }}>
            <Button htmlType="submit" loading={saving} type="primary">
              Save settings
            </Button>
            <Button
              onClick={() =>
                form.setFieldsValue({
                  hotLeadThreshold: scoringConfig.hotLeadThreshold,
                  rules: scoringConfig.rules,
                })
              }
            >
              Reset form
            </Button>
          </Space>
        </Form>
      </Card>

      <Card className="surface-card" title="Current rule preview">
        <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
          <Typography.Text type="secondary">
            Every matching keyword adds its configured score when a lead is created.
          </Typography.Text>
          <Space wrap>
            {scoringConfig.rules.map((rule) => (
              <Tag key={`${rule.keyword}-${rule.score}`}>
                {rule.keyword} {rule.score >= 0 ? `+${rule.score}` : rule.score}
              </Tag>
            ))}
          </Space>
        </Space>
      </Card>

      <Card className="surface-card" title="Platforms">
        <Typography.Paragraph>
          <ul>
            <li><strong>Upwork:</strong> Should use email alerts or approved API only.</li>
            <li><strong>Freelancer:</strong> API can be connected later.</li>
            <li><strong>PeoplePerHour:</strong> Can use feed/email/manual saved search links.</li>
          </ul>
        </Typography.Paragraph>
      </Card>

      <Card className="surface-card" title="Notification Preferences">
        <Typography.Paragraph>
          Notifications are currently manual. System alerts will be introduced alongside automated data fetching.
        </Typography.Paragraph>
      </Card>

      <Card className="surface-card" title="Future Automation Sources">
        <Typography.Paragraph>
          Automation worker is planned for a later phase. Currently, all leads must be added manually or via basic webhooks.
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
