import { LockOutlined, MailOutlined, RadarChartOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Space, Tag, message } from 'antd'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'

interface LoginFormValues {
  email: string
  password: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isConfigured, loading, signIn, user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const redirectTo = location.state?.from?.pathname ?? '/'

  if (!loading && user) {
    return <Navigate replace to={redirectTo} />
  }

  async function handleSubmit(values: LoginFormValues) {
    setSubmitting(true)

    try {
      await signIn(values.email, values.password)
      message.success('Signed in successfully.')
      navigate(redirectTo, { replace: true })
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-panel">
        <section className="login-hero">
          <div>
            <span className="login-eyebrow">
              <RadarChartOutlined />
              Hkrafted operations tool
            </span>
            <h1>LeadRadar tracks all incoming freelance projects.</h1>
            <p>
              Review new leads quickly, identify hot opportunities, add notes, and track application status from one place.
            </p>
            <div className="login-stats">
              <div className="login-stat">
                <strong>Protected</strong>
                <span>Internal workspace with Supabase auth</span>
              </div>
              <div className="login-stat">
                <strong>80+</strong>
                <span>Score required for high-priority leads</span>
              </div>
              <div className="login-stat">
                <strong>6</strong>
                <span>Core views to manage the sales pipeline</span>
              </div>
            </div>
          </div>
          <Space wrap>
            <Tag color="processing">Ant Design</Tag>
            <Tag color="success">Supabase</Tag>
            <Tag color="cyan">React + Vite</Tag>
          </Space>
        </section>
        <Card bordered={false} className="login-card">
          <div className="login-card-header">
            <h2>Sign in</h2>
            <p>Use your Supabase email and password to access the dashboard.</p>
          </div>
          {!isConfigured ? (
            <Alert
              message="Supabase env is incomplete"
              description="Add both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the web app env before signing in."
              showIcon
              type="warning"
            />
          ) : null}
          <Form<LoginFormValues>
            layout="vertical"
            requiredMark={false}
            style={{ marginTop: 24 }}
            onFinish={(values) => void handleSubmit(values)}
          >
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Enter your email address.' },
                { type: 'email', message: 'Use a valid email address.' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="you@hkrafted.com" />
            </Form.Item>
            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: 'Enter your password.' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Enter your password"
              />
            </Form.Item>
            <Button
              block
              htmlType="submit"
              loading={submitting}
              size="large"
              type="primary"
            >
              Access LeadRadar
            </Button>
          </Form>
        </Card>
      </div>
    </div>
  )
}
