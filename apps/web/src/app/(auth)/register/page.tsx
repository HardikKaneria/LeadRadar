
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { ApartmentOutlined, LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Form, Input, Typography } from 'antd';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { AuthFrame } from '@/components/auth-frame';

const { Title, Text } = Typography;

interface RegisterValues {
  name: string;
  organizationName: string;
  email: string;
  password: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { reload } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFinish(values: RegisterValues) {
    setBusy(true);
    setError(null);
    setNotice(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { name: values.name } },
    });
    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    // With email confirmation on, there's no session yet — the org is created on first sign-in.
    if (!data.session) {
      setNotice('Check your email to confirm your account, then sign in.');
      setBusy(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc('create_organization', {
      org_name: values.organizationName,
    });
    if (rpcError) {
      setError(`Account created, but workspace setup failed: ${rpcError.message}`);
      setBusy(false);
      return;
    }

    await reload();
    navigate('/');
  }

  return (
    <AuthFrame>
      <Flex vertical gap={4} style={{ marginBottom: 24 }}>
        <Text className="eyebrow">New workspace</Text>
        <Title level={3} style={{ margin: 0 }}>
          Create your workspace
        </Title>
        <Text type="secondary">You become the owner of a new organization.</Text>
      </Flex>

      {error && (
        <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />
      )}
      {notice && (
        <Alert type="success" showIcon title={notice} style={{ marginBottom: 16 }} />
      )}

      <Form<RegisterValues> layout="vertical" requiredMark={false} onFinish={onFinish} disabled={busy}>
        <Form.Item name="name" label="Your name" rules={[{ required: true, message: 'Enter your name' }]}>
          <Input size="large" prefix={<UserOutlined />} placeholder="Jordan Lee" autoComplete="name" />
        </Form.Item>

        <Form.Item
          name="organizationName"
          label="Organization"
          rules={[{ required: true, message: 'Name your workspace' }]}
        >
          <Input size="large" prefix={<ApartmentOutlined />} placeholder="Acme Studio" />
        </Form.Item>

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
          rules={[
            { required: true, message: 'Choose a password' },
            { min: 8, message: 'At least 8 characters' },
          ]}
        >
          <Input.Password
            size="large"
            prefix={<LockOutlined />}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </Form.Item>

        <Button type="primary" htmlType="submit" size="large" block loading={busy} style={{ marginTop: 8 }}>
          Create workspace
        </Button>
      </Form>

      <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 20 }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </Text>
    </AuthFrame>
  );
}
