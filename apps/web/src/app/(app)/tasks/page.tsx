import { useEffect, useState } from 'react';
import { CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Modal,
  Pagination,
  Result,
  Segmented,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { TaskQueue, TaskSummary } from '@radar/contracts';
import { completeTask, listTasks, rescheduleTask } from '@/lib/tasks';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { PriorityTag } from '@/components/ui/status-tag';

dayjs.extend(relativeTime);

const { Text } = Typography;

const PAGE_SIZE = 25;

const QUEUE_OPTIONS: { label: string; value: TaskQueue }[] = [
  { label: 'Overdue', value: 'overdue' },
  { label: 'Today', value: 'today' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Assigned to me', value: 'assigned' },
  { label: 'All open', value: 'all' },
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function isInvariantError(error: unknown): boolean {
  return error instanceof Error && /follow-up/i.test(error.message);
}

function DuePill({ task }: { task: TaskSummary }) {
  if (!task.dueAt) return <Tag>No due date</Tag>;
  const due = dayjs(task.dueAt);
  const overdue = due.isBefore(dayjs());
  return (
    <Tag color={overdue ? 'error' : 'default'}>
      {overdue ? 'Overdue' : 'Due'} {due.fromNow()}
    </Tag>
  );
}

export default function TasksPage() {
  const { currentOrg, session, can } = useAuth();
  const { message } = App.useApp();

  const organizationId = currentOrg?.organizationId ?? null;
  const userId = session?.user?.id ?? null;
  const canRead = can('tasks.manage') || can('tasks.manage_own');

  const [queue, setQueue] = useState<TaskQueue>('today');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TaskSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [completeTarget, setCompleteTarget] = useState<TaskSummary | null>(null);

  useEffect(() => {
    if (!organizationId || !canRead) {
      setItems([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listTasks(organizationId, {
      queue,
      assignedTo: queue === 'assigned' ? (userId ?? undefined) : undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setTotal(0);
        setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, canRead, queue, page, userId, reloadToken]);

  function refresh() {
    setReloadToken((value) => value + 1);
  }

  function changeQueue(next: TaskQueue) {
    setQueue(next);
    setPage(1);
  }

  async function reschedule(task: TaskSummary, dueAt: Dayjs) {
    if (!organizationId) return;
    try {
      await rescheduleTask(organizationId, { taskId: task.id, dueAt: dueAt.toISOString() });
      message.success('Task rescheduled');
      refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  }

  const canWriteTasks = can('tasks.manage') || can('tasks.manage_own');

  if (!currentOrg) {
    return (
      <Result
        status="info"
        title="No workspace yet"
        subTitle="Join or create a workspace before working your task queues."
      />
    );
  }

  if (!canRead) {
    return (
      <Result
        status="403"
        title="No access"
        subTitle="Your current role does not include tasks.manage."
      />
    );
  }

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Follow-ups"
        title="Tasks"
        subtitle="Your follow-up queues across the pipeline — clear the overdue work first, then today's."
        extra={
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
            Refresh
          </Button>
        }
      />

      <Card size="small">
        <Flex align="center" justify="space-between" wrap gap={12}>
          <Segmented
            value={queue}
            onChange={(value) => changeQueue(value as TaskQueue)}
            options={QUEUE_OPTIONS}
          />
          <Badge count={total} overflowCount={9999} color="blue" showZero />
        </Flex>
      </Card>

      <Card size="small">
        {error ? (
          <Alert type="error" showIcon message={error} />
        ) : loading && items.length === 0 ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              queue === 'overdue'
                ? 'Nothing overdue — nice.'
                : queue === 'today'
                  ? 'No tasks due today.'
                  : 'No tasks in this queue.'
            }
          />
        ) : (
          <>
            <List
              dataSource={items}
              renderItem={(task) => (
                <List.Item
                  actions={
                    canWriteTasks
                      ? [
                          <DatePicker
                            key="reschedule"
                            size="small"
                            showTime
                            value={null}
                            placeholder="Reschedule"
                            onChange={(value) => {
                              if (value) void reschedule(task, value);
                            }}
                          />,
                          <Button
                            key="complete"
                            size="small"
                            type="primary"
                            icon={<CheckOutlined />}
                            onClick={() => setCompleteTarget(task)}
                          >
                            Complete
                          </Button>,
                        ]
                      : undefined
                  }
                >
                  <List.Item.Meta
                    title={
                      <Space size={[6, 6]} wrap>
                        <Text strong>{task.title}</Text>
                        <PriorityTag priority={task.priority} />
                      </Space>
                    }
                    description={<DuePill task={task} />}
                  />
                </List.Item>
              )}
            />
            <Flex justify="center" style={{ marginTop: 12 }}>
              <Pagination
                current={page}
                total={total}
                pageSize={PAGE_SIZE}
                showSizeChanger={false}
                onChange={setPage}
                disabled={loading}
              />
            </Flex>
          </>
        )}
      </Card>

      <CompleteTaskModal
        task={completeTarget}
        onClose={() => setCompleteTarget(null)}
        onDone={() => {
          setCompleteTarget(null);
          refresh();
        }}
      />
    </Flex>
  );
}

// Standalone complete modal. The "no active lead without an open task" invariant is enforced by the
// `complete_task` RPC; here we offer an optional follow-up up front and, if the RPC rejects because
// this was the last open task on an active lead, make the follow-up required and let the user retry.
interface CompleteTaskModalProps {
  task: TaskSummary | null;
  onClose: () => void;
  onDone: () => void;
}

function CompleteTaskModal({ task, onClose, onDone }: CompleteTaskModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ followUpTitle?: string; followUpDueAt: Dayjs | null }>();
  const [submitting, setSubmitting] = useState(false);
  const [requireFollowUp, setRequireFollowUp] = useState(false);

  const open = task != null;

  async function submit() {
    if (!task) return;
    const values = await form.validateFields();
    if (requireFollowUp && !values.followUpTitle?.trim()) {
      form.setFields([{ name: 'followUpTitle', errors: ['A follow-up is required for an active lead'] }]);
      return;
    }
    setSubmitting(true);
    try {
      await completeTask({
        taskId: task.id,
        followUpTitle: values.followUpTitle?.trim() || undefined,
        followUpDueAt: values.followUpDueAt ? values.followUpDueAt.toISOString() : undefined,
      });
      message.success('Task completed');
      onDone();
    } catch (err) {
      if (isInvariantError(err)) {
        setRequireFollowUp(true);
        message.warning('This active lead needs an open follow-up. Add one to complete this task.');
      } else {
        message.error(getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Complete task"
      open={open}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={submitting}
      okText="Complete"
      afterClose={() => {
        form.resetFields();
        setRequireFollowUp(false);
      }}
    >
      {requireFollowUp ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="This is the lead's only open task"
          description="An active lead must always have an open follow-up. Schedule the next one to complete this task."
        />
      ) : null}
      <Form form={form} layout="vertical" initialValues={{ followUpDueAt: dayjs().add(1, 'day') }}>
        <Form.Item
          name="followUpTitle"
          label={requireFollowUp ? 'Next follow-up' : 'Next follow-up (optional)'}
          rules={requireFollowUp ? [{ required: true, message: 'A follow-up is required for an active lead' }] : []}
        >
          <Input placeholder="Check back next week" maxLength={200} />
        </Form.Item>
        <Form.Item name="followUpDueAt" label="Follow-up due">
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
