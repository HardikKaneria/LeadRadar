import { calculateLeadScore } from '@leadradar/shared'
import { Modal, Form, Input, Select, DatePicker, Space, Tag, Typography, message } from 'antd'
import type { Dayjs } from 'dayjs'
import { DEFAULT_PLATFORM_OPTIONS } from '@leadradar/shared'
import { useState } from 'react'
import { useAppData } from '../contexts/app-data-context'
import { getScoreTagColor } from '../lib/lead-ui'

interface ManualLeadFormValues {
  budgetText?: string
  description?: string
  platform: string
  postedAt?: Dayjs
  title: string
  url: string
}

interface AddLeadModalProps {
  open: boolean
  onClose: () => void
}

export function AddLeadModal({ open, onClose }: AddLeadModalProps) {
  const [form] = Form.useForm<ManualLeadFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const { createManualLead, scoringConfig } = useAppData()
  const formValues = Form.useWatch([], form)
  const scorePreview = calculateLeadScore(
    {
      budgetText: formValues?.budgetText,
      description: formValues?.description,
      platform: formValues?.platform,
      title: formValues?.title,
    },
    scoringConfig,
  )

  async function handleSubmit(values: ManualLeadFormValues) {
    setSubmitting(true)

    try {
      await createManualLead({
        budgetText: values.budgetText,
        description: values.description,
        platform: values.platform,
        postedAt: values.postedAt?.toISOString(),
        title: values.title,
        url: values.url,
      })
      message.success('Lead added successfully.')
      form.resetFields()
      onClose()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to add lead.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      destroyOnHidden
      okText="Add lead"
      open={open}
      title="Add Manual Lead"
      width={720}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      onOk={() => form.submit()}
      okButtonProps={{ loading: submitting }}
    >
      <div style={{ marginBottom: 24 }}>
        <Typography.Text type="secondary">
          Save a freelance project opportunity manually. LeadRadar will score it based on Hkrafted’s service keywords.
        </Typography.Text>
      </div>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          label="Lead title"
          name="title"
          rules={[{ required: true, message: 'Add a short title for the lead.' }]}
        >
          <Input placeholder="Build sales dashboard for SaaS startup" />
        </Form.Item>
        <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
          <Space direction="horizontal" size="middle" style={{ display: 'flex' }}>
            <Form.Item
              label="Platform"
              name="platform"
              rules={[{ required: true, message: 'Select a lead source.' }]}
              style={{ flex: 1 }}
            >
              <Select
                options={DEFAULT_PLATFORM_OPTIONS.map((platform) => ({
                  label: platform,
                  value: platform,
                }))}
                placeholder="Select platform"
                showSearch
              />
            </Form.Item>
            <Form.Item
              label="Posted at"
              name="postedAt"
              style={{ flex: 1 }}
            >
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item
            label="Lead URL"
            name="url"
            rules={[
              { required: true, message: 'Add the original lead URL.' },
              { type: 'url', message: 'Enter a valid URL.' },
            ]}
          >
            <Input placeholder="https://www.upwork.com/jobs/..." />
          </Form.Item>
          <Form.Item label="Budget" name="budgetText">
            <Input placeholder="$2,000 - $5,000 or Monthly retainer" />
          </Form.Item>
          <Form.Item label="Description" name="description" rules={[{ required: true, message: 'Description is required for accurate scoring.' }]}>
            <Input.TextArea
              autoSize={{ minRows: 5, maxRows: 8 }}
              placeholder="Paste the project brief, client requirements, or qualification notes."
            />
          </Form.Item>
        </Space>
        <div className="surface-card" style={{ padding: 16, borderRadius: 18 }}>
          <Space direction="vertical" size="small" style={{ display: 'flex' }}>
            <Typography.Text strong>Scoring preview</Typography.Text>
            <Space wrap>
              <Tag className="score-tag" color={getScoreTagColor(scorePreview.score, scoringConfig.hotLeadThreshold)}>
                Score {scorePreview.score}
              </Tag>
              <Tag>Hot threshold {scoringConfig.hotLeadThreshold}</Tag>
            </Space>
            <Typography.Text type="secondary">{scorePreview.reason}</Typography.Text>
            <Space wrap>
              {scorePreview.matchedKeywords.length > 0 ? (
                scorePreview.matchedKeywords.map((keyword) => (
                  <Tag key={keyword}>{keyword}</Tag>
                ))
              ) : (
                <Typography.Text type="secondary">
                  Matching keywords will appear here as you type.
                </Typography.Text>
              )}
            </Space>
          </Space>
        </div>
      </Form>
    </Modal>
  )
}
