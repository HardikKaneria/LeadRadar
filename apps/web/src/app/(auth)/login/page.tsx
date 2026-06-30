
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Form, Input, Typography } from 'antd';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { AuthFrame } from '@/components/auth-frame';

const { Title, Text } = Typography;

interface LoginValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { reload } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFinish(values: LoginValues) {
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }
    await reload();
    navigate('/');
  }

  return (
    <AuthFrame>
      <Flex vertical gap={4} style={{ marginBottom: 24 }}>
        <Text className="eyebrow">Sign in</Text>
        <Title level={3} style={{ margin: 0 }}>
          Welcome back
        </Title>
        <Text type="secondary">Sign in to your Radar workspace.</Text>
      </Flex>

      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Form<LoginValues> layout="vertical" requiredMark={false} onFinish={onFinish} disabled={busy}>
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Enter your email' },
            { type: 'email', message: 'Enter a valid email' },
          ]}
        >
          <Input size="large" prefix={<MailOutlined />} placeholder="you@company.com" autoComplete="email" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: 'Enter your password' }]}
        >
          <Input.Password
            size="large"
            prefix={<LockOutlined />}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </Form.Item>

        <Button type="primary" htmlType="submit" size="large" block loading={busy} style={{ marginTop: 8 }}>
          Sign in
        </Button>
      </Form>

      <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 20 }}>
        No account? <Link to="/register">Create one</Link>
      </Text>
    </AuthFrame>
  );
}
