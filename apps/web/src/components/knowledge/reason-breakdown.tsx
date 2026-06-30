import React from 'react';
import { Card, Empty } from 'antd';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ReasonInsight } from '@radar/contracts';

interface ReasonBreakdownProps {
  lostReasons: ReasonInsight[];
  onHoldReasons: ReasonInsight[];
  loading?: boolean;
}

const COLORS = ['#f5222d', '#fa8c16', '#fadb14', '#a0d911', '#13c2c2', '#2f54eb', '#722ed1', '#eb2f96'];

export function ReasonBreakdown({ lostReasons, onHoldReasons, loading }: ReasonBreakdownProps) {
  if (!loading && lostReasons.length === 0 && onHoldReasons.length === 0) {
    return (
      <Card title="Win/Loss Reasons" className="h-[400px]">
        <Empty description="No reason data available for this timeframe" />
      </Card>
    );
  }

  // Use lost reasons if available, otherwise on-hold
  const data = lostReasons.length > 0 ? lostReasons : onHoldReasons;
  const title = lostReasons.length > 0 ? 'Top Lost Reasons' : 'Top On Hold Reasons';

  const chartData = data.map(d => ({
    name: d.reason,
    value: d.count
  }));

  return (
    <Card title={title} loading={loading} className="h-[400px]">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            fill="#8884d8"
            paddingAngle={5}
            dataKey="value"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number, name: string) => [value, name]}
            contentStyle={{ borderRadius: '8px', border: '1px solid #f0f0f0' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}
