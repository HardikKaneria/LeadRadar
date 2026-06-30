import React from 'react';
import { Card, Empty } from 'antd';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { ConversionInsight } from '@radar/contracts';

interface ConversionFunnelProps {
  data: ConversionInsight[];
  loading?: boolean;
}

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#eb2f96'];

export function ConversionFunnel({ data, loading }: ConversionFunnelProps) {
  if (!loading && data.length === 0) {
    return (
      <Card title="Conversion by Group" className="h-[400px]">
        <Empty description="No conversion data available for this timeframe" />
      </Card>
    );
  }

  // Format data for Recharts
  const chartData = data.map((d) => ({
    name: d.group,
    Total: d.totalLeads,
    Won: d.wonLeads,
    WinRate: Number(d.winRate.toFixed(1)),
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow-md">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.name === 'WinRate' ? `${entry.value}%` : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card title="Conversion Funnel" loading={loading} className="h-[400px]">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis yAxisId="left" orientation="left" stroke="#1677ff" />
          <YAxis yAxisId="right" orientation="right" stroke="#52c41a" domain={[0, 100]} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar yAxisId="left" dataKey="Total" fill="#1677ff" radius={[4, 4, 0, 0]} name="Total Leads">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.6} />
            ))}
          </Bar>
          <Bar yAxisId="left" dataKey="Won" fill="#52c41a" radius={[4, 4, 0, 0]} name="Won Leads">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
