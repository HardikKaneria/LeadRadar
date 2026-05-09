import { isHotLead, LEAD_STATUSES } from '@leadradar/shared'
import { Card, Col, Empty, List, Row, Space, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { useAppData } from '../contexts/app-data-context'
import {
  formatDateTime,
  formatLeadStatus,
  formatScoringConfigSummary,
  getScoreTagColor,
} from '../lib/lead-ui'

export function DashboardPage() {
  const { leads, scoringConfig } = useAppData()
  const statusOptions = [...LEAD_STATUSES]

  const hotLeads = leads.filter((lead) =>
    isHotLead(lead.score, scoringConfig.hotLeadThreshold),
  )
  const appliedLeads = leads.filter((lead) => lead.status === 'applied')
  const followUpLeads = leads.filter((lead) => lead.status === 'follow_up')
  const wonLeads = leads.filter((lead) => lead.status === 'won')
  const ignoredLeads = leads.filter((lead) => lead.status === 'ignored')
  const latestLeads = leads.slice(0, 5)

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2>Welcome to LeadRadar</h2>
          <p>
            Track freelance opportunities, review hot leads, and manage application progress from one place.
          </p>
        </div>
        <Tag color="processing">{formatScoringConfigSummary(scoringConfig)}</Tag>
      </div>

      <section className="dashboard-grid">
        <Card className="dashboard-card surface-card">
          <span className="metric-label">Total Leads</span>
          <strong className="metric-value">{leads.length}</strong>
        </Card>
        <Card className="dashboard-card surface-card">
          <span className="metric-label">Hot Leads</span>
          <strong className="metric-value">{hotLeads.length}</strong>
        </Card>
        <Card className="dashboard-card surface-card">
          <span className="metric-label">Applied</span>
          <strong className="metric-value">{appliedLeads.length}</strong>
        </Card>
        <Card className="dashboard-card surface-card">
          <span className="metric-label">Follow Up</span>
          <strong className="metric-value">{followUpLeads.length}</strong>
        </Card>
        <Card className="dashboard-card surface-card">
          <span className="metric-label">Won</span>
          <strong className="metric-value">{wonLeads.length}</strong>
        </Card>
        <Card className="dashboard-card surface-card">
          <span className="metric-label">Ignored</span>
          <strong className="metric-value">{ignoredLeads.length}</strong>
        </Card>
      </section>

      <Row gutter={[16, 16]}>
        <Col span={16}>
          <Card className="surface-card" title="Today's Focus" style={{ marginBottom: 16 }}>
            <Typography.Paragraph>
              Review high-score leads first, shortlist the best opportunities, and update each lead after applying.
            </Typography.Paragraph>
          </Card>
          <Card className="surface-card" title="Recent opportunities">
            {latestLeads.length === 0 ? (
              <Empty description="No leads yet. Add your first manual lead from the Leads page." />
            ) : (
              <List
                dataSource={latestLeads}
                itemLayout="horizontal"
                renderItem={(lead) => (
                  <List.Item
                    actions={[
                      <Link key={lead.id} to={`/leads/${lead.id}`}>
                        Open
                      </Link>,
                    ]}
                  >
                    <List.Item.Meta
                      description={
                        <Space wrap>
                          <Tag>{lead.platform}</Tag>
                          <Tag color={getScoreTagColor(lead.score, scoringConfig.hotLeadThreshold)}>
                            Score {lead.score}
                          </Tag>
                          <Tag color="default">{formatDateTime(lead.created_at)}</Tag>
                        </Space>
                      }
                      title={lead.title}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card className="surface-card" title="Lead Quality" style={{ marginBottom: 16 }}>
            <List size="small">
              <List.Item>
                <span><Tag color="error">80-100</Tag> High-priority lead</span>
              </List.Item>
              <List.Item>
                <span><Tag color="success">60-79</Tag> Good fit</span>
              </List.Item>
              <List.Item>
                <span><Tag color="warning">40-59</Tag> Review manually</span>
              </List.Item>
              <List.Item>
                <span><Tag color="default">Below 40</Tag> Low priority</span>
              </List.Item>
            </List>
          </Card>
          <Card className="surface-card" title="Status distribution">
            <List
              dataSource={statusOptions}
              renderItem={(status) => {
                const count = leads.filter((lead) => lead.status === status).length

                return (
                  <List.Item>
                    <List.Item.Meta
                      description={`${count} lead${count === 1 ? '' : 's'}`}
                      title={formatLeadStatus(status)}
                    />
                  </List.Item>
                )
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

