import { LEAD_STATUSES, isHotLead } from '@leadradar/shared'
import { PlusOutlined, SearchOutlined, EyeOutlined, LinkOutlined, StarOutlined, CloseOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Input, Select, Space, Switch, Table, Tag, Tooltip } from 'antd'
import type { TableProps } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddLeadModal } from '../components/add-lead-modal'
import { useAppData } from '../contexts/app-data-context'
import {
  formatDateTime,
  formatLeadStatus,
  getScoreTagColor,
  formatBudget,
} from '../lib/lead-ui'

export function LeadsPage() {
  const navigate = useNavigate()
  const { leads, scoringConfig, updateLeadStatus } = useAppData()
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [hotOnly, setHotOnly] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const platformOptions = Array.from(new Set(leads.map((lead) => lead.platform))).map(
    (platform) => ({
      label: platform,
      value: platform,
    }),
  )

  const filteredLeads = leads.filter((lead) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const titleMatch = lead.title?.toLowerCase().includes(query)
      const descMatch = lead.description?.toLowerCase().includes(query)
      if (!titleMatch && !descMatch) {
        return false
      }
    }

    if (platformFilter && lead.platform !== platformFilter) {
      return false
    }

    if (statusFilter && lead.status !== statusFilter) {
      return false
    }

    if (hotOnly && !isHotLead(lead.score, scoringConfig.hotLeadThreshold)) {
      return false
    }

    return true
  })

  const columns: TableProps<(typeof filteredLeads)[number]>['columns'] = [
    {
      dataIndex: 'platform',
      key: 'platform',
      render: (platform) => <Tag>{platform}</Tag>,
      title: 'Platform',
    },
    {
      dataIndex: 'title',
      key: 'title',
      render: (_value, lead) => (
        <Space direction="vertical" size={2}>
          <strong>{lead.title}</strong>
          <span style={{ color: '#66758b' }}>{lead.url}</span>
        </Space>
      ),
      title: 'Lead',
    },
    {
      key: 'budget',
      render: (_value, lead) => formatBudget(lead.budget_min, lead.budget_max, lead.currency, lead.budget_text),
      title: 'Budget',
    },
    {
      dataIndex: 'score',
      key: 'score',
      render: (score) => (
        <Tag className="score-tag" color={getScoreTagColor(score, scoringConfig.hotLeadThreshold)}>
          {score}
        </Tag>
      ),
      title: 'Score',
    },
    {
      dataIndex: 'matched_keywords',
      key: 'matched_keywords',
      render: (matchedKeywords: string[] | null) => {
        if (!matchedKeywords || matchedKeywords.length === 0) {
          return <span className="text-slate-400 text-xs italic">None</span>
        }
        const visible = matchedKeywords.slice(0, 2)
        const hidden = matchedKeywords.slice(2)
        return (
          <Space wrap size={[0, 4]}>
            {visible.map((kw) => <Tag key={kw} bordered={false} color="blue">{kw}</Tag>)}
            {hidden.length > 0 && (
              <Tooltip title={hidden.join(', ')}>
                <Tag bordered={false}>+{hidden.length} more</Tag>
              </Tooltip>
            )}
          </Space>
        )
      },
      title: 'Matched Skills',
    },
    {
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag>{formatLeadStatus(status)}</Tag>,
      title: 'Status',
    },
    {
      dataIndex: 'posted_at',
      key: 'posted_at',
      render: (postedAt) => formatDateTime(postedAt),
      title: 'Posted',
    },
    {
      key: 'actions',
      align: 'right',
      render: (_value, lead) => (
        <Space size={4}>
          <Tooltip title="View Details">
            <Button type="text" size="middle" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }} />
          </Tooltip>
          <Tooltip title="Open Original Job">
            <Button type="text" size="middle" icon={<LinkOutlined />} onClick={(e) => { e.stopPropagation(); window.open(lead.url, '_blank') }} />
          </Tooltip>
          {lead.status !== 'interested' && (
            <Tooltip title="Mark as Interested">
              <Button type="text" size="middle" icon={<StarOutlined />} onClick={(e) => { e.stopPropagation(); updateLeadStatus(lead.id, 'interested') }} />
            </Tooltip>
          )}
          {lead.status !== 'ignored' && (
            <Tooltip title="Ignore Lead">
              <Button type="text" size="middle" danger icon={<CloseOutlined />} onClick={(e) => { e.stopPropagation(); updateLeadStatus(lead.id, 'ignored') }} />
            </Tooltip>
          )}
        </Space>
      ),
      title: '',
    },
  ]

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2>All Leads</h2>
          <p>
            Review, filter, and manage freelance project opportunities collected for Hkrafted.
          </p>
        </div>
      </div>
      <Card className="surface-card">
        <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div className="table-filters" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <Input
              placeholder="Search by title or description"
              prefix={<SearchOutlined />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 250 }}
              allowClear
            />
            <Select
              allowClear
              options={platformOptions}
              placeholder="Filter by platform"
              style={{ minWidth: 180 }}
              value={platformFilter}
              onChange={setPlatformFilter}
            />
            <Select
              allowClear
              options={LEAD_STATUSES.map((status) => ({
                label: formatLeadStatus(status),
                value: status,
              }))}
              placeholder="Filter by status"
              style={{ minWidth: 180 }}
              value={statusFilter}
              onChange={setStatusFilter}
            />
            <Space>
              <Switch checked={hotOnly} onChange={setHotOnly} />
              <span>Hot leads only</span>
            </Space>
          </div>
          <Button
            icon={<PlusOutlined />}
            type="primary"
            onClick={() => setIsModalOpen(true)}
          >
            Add manual lead
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={filteredLeads}
          locale={{
            emptyText: (
              <Empty description="No leads found yet. Add a manual lead or connect your first source when automation is ready." />
            ),
          }}
          pagination={{ pageSize: 10 }}
          rowKey="id"
          style={{ marginTop: 20 }}
          onRow={(record) => ({
            onClick: () => navigate(`/leads/${record.id}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
      <AddLeadModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}
