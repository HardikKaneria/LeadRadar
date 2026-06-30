'use client';

import { Card, Button, Alert, Divider, Typography } from 'antd';
import { SafetyCertificateOutlined, ExportOutlined, DeleteOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';

const { Title, Text, Paragraph } = Typography;

export default function SecurityPage() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <PageHeader
        title="Security & Data"
        subtitle="Manage active sessions and data lifecycle."
      />

      <div className="flex flex-col gap-6 mt-6">
        <Card title={<><SafetyCertificateOutlined className="mr-2" /> Active Sessions</>}>
          <Alert message="Session management is currently handled via Supabase Auth automatically." type="info" showIcon />
          <div className="mt-4">
            <Button>Sign Out of All Other Sessions</Button>
          </div>
        </Card>

        <Card title={<><ExportOutlined className="mr-2" /> Data Export</>}>
          <Paragraph>
            Download a complete archive of your organization's leads, opportunities, and discoveries in JSON/CSV format.
          </Paragraph>
          <Button type="default" icon={<ExportOutlined />}>Request Data Export</Button>
        </Card>

        <Card title={<><DeleteOutlined className="mr-2" /> Danger Zone</>} className="border-red-200">
          <Paragraph className="text-gray-600">
            Permanently delete your organization and all associated data. This action cannot be undone and will immediately cancel any active subscriptions.
          </Paragraph>
          <Button danger type="primary">Delete Organization</Button>
        </Card>
      </div>
    </div>
  );
}
