
import { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Descriptions, Button, Spin, Flex } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { supabase } from '@/lib/supabase';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export default function AdminHealthPage() {
  const [loading, setLoading] = useState(true);
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  const runChecks = useCallback(async () => {
    setLoading(true);
    setSupabaseOk(null);
    setApiOk(null);

    // Supabase connectivity check
    try {
      const { error } = await supabase.from('organizations').select('id').limit(1);
      setSupabaseOk(!error);
    } catch {
      setSupabaseOk(false);
    }

    // API health check
    try {
      const res = await fetch(`${API_URL}/api/v1/health`, { signal: AbortSignal.timeout(5000) });
      setApiOk(res.ok);
    } catch {
      setApiOk(false);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="System Health"
        subtitle="Live connectivity and environment status."
        extra={
          <Button icon={<ReloadOutlined />} onClick={runChecks} loading={loading}>
            Re-check
          </Button>
        }
      />

      {loading ? (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin size="large" description="Running health checks…">
            <div style={{ padding: 24 }} />
          </Spin>
        </Flex>
      ) : (
        <>
          <Card variant="borderless" title="Service Connectivity">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Supabase Database">
                <Badge
                  status={supabaseOk ? 'success' : 'error'}
                  text={supabaseOk ? 'Connected' : 'Unreachable'}
                />
              </Descriptions.Item>
              <Descriptions.Item label="API Server">
                <Badge
                  status={apiOk ? 'success' : 'error'}
                  text={apiOk ? 'Connected' : 'Unreachable'}
                />
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card variant="borderless" title="System Info">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Mode">
                {import.meta.env.MODE}
              </Descriptions.Item>
              <Descriptions.Item label="API URL">
                {API_URL}
              </Descriptions.Item>
              <Descriptions.Item label="Supabase URL">
                {import.meta.env.VITE_SUPABASE_URL ?? '(not set)'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      )}
    </div>
  );
}
