'use client';

import React, { useEffect, useState } from 'react';
import { Row, Col, Select, Typography, Space, Alert } from 'antd';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { ConversionInsightsResult, ReasonInsightsResult } from '@radar/contracts';
import { ConversionFunnel } from '@/components/knowledge/conversion-funnel';
import { ReasonBreakdown } from '@/components/knowledge/reason-breakdown';

const { Title, Text } = Typography;
const { Option } = Select;

export default function KnowledgePage() {
  const { session, organization } = useAuth();
  
  const [timeframe, setTimeframe] = useState<number>(30);
  const [groupBy, setGroupBy] = useState<string>('source');
  
  const [conversionData, setConversionData] = useState<ConversionInsightsResult | null>(null);
  const [reasonData, setReasonData] = useState<ReasonInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !organization) return;
    
    let mounted = true;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const ctx = {
          accessToken: session.access_token,
          organizationId: organization.id,
        };
        
        const [conversion, reasons] = await Promise.all([
          api.getConversionInsights(ctx, timeframe, groupBy),
          api.getReasonInsights(ctx, timeframe, groupBy),
        ]);
        
        if (mounted) {
          setConversionData(conversion);
          setReasonData(reasons);
        }
      } catch (err: any) {
        console.error('Failed to fetch knowledge insights:', err);
        if (mounted) setError(err.message || 'Failed to load insights');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    fetchData();
    
    return () => { mounted = false; };
  }, [session, organization, timeframe, groupBy]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Knowledge Engine" 
        subtitle="Insights on wins, losses, and conversion performance."
        extra={
          <Space>
            <Text type="secondary">Timeframe:</Text>
            <Select value={timeframe} onChange={setTimeframe} style={{ width: 120 }}>
              <Option value={7}>Last 7 Days</Option>
              <Option value={30}>Last 30 Days</Option>
              <Option value={90}>Last 90 Days</Option>
              <Option value={365}>Last 1 Year</Option>
            </Select>
            
            <Text type="secondary" className="ml-4">Group By:</Text>
            <Select value={groupBy} onChange={setGroupBy} style={{ width: 140 }}>
              <Option value="source">Source</Option>
              <Option value="score">AI Score</Option>
              <Option value="service_match">Service Match</Option>
            </Select>
          </Space>
        }
      />

      {error && <Alert type="error" message={error} showIcon />}

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={14}>
          <ConversionFunnel data={conversionData?.data || []} loading={loading} />
        </Col>
        <Col xs={24} lg={10}>
          <ReasonBreakdown 
            lostReasons={reasonData?.lost || []} 
            onHoldReasons={reasonData?.onHold || []} 
            loading={loading} 
          />
        </Col>
      </Row>
    </div>
  );
}
