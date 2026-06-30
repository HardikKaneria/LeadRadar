
import { useEffect, useState } from 'react';
import {
  DeleteOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RobotOutlined,
  RocketOutlined,
  DownloadOutlined,
  UploadOutlined,
  SwapOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Empty,
  Flex,
  Input,
  List,
  Popconfirm,
  Skeleton,
  Tabs,
  Tag,
  Timeline,
  Typography,
  Upload,
  theme,
} from 'antd';
import type { UploadProps } from 'antd';
import dayjs from 'dayjs';
import type { Activity, Attachment, Note, TimelineTarget } from '@radar/contracts';
import { addNote, deleteNote, listActivities, listAttachments, listNotes, recordAttachment, deleteAttachment } from '@/lib/timeline';
import { supabase } from '@/lib/supabase';

const { Text, Paragraph } = Typography;

function formatDateTime(value: string): string {
  return dayjs(value).format('MMM D, YYYY · h:mm A');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

const ACTIVITY_ICON: Record<Activity['type'], { icon: React.ReactNode; color: string }> = {
  created: { icon: <PlusOutlined />, color: 'green' },
  status_changed: { icon: <SwapOutlined />, color: 'blue' },
  converted: { icon: <RocketOutlined />, color: 'purple' },
  assigned: { icon: <UserOutlined />, color: 'gold' },
  note_added: { icon: <FileTextOutlined />, color: 'gray' },
  attachment_added: { icon: <PaperClipOutlined />, color: 'gray' },
  researched: { icon: <RobotOutlined />, color: 'cyan' },
  custom: { icon: <FileTextOutlined />, color: 'gray' },
};

/**
 * Activity log + notes for any timeline entity (P4-07-UI). Reads through `lib/timeline.ts` under RLS;
 * adding/deleting notes is gated on `opportunities.write` (enforced again by the RPCs). Attachments
 * are a separate follow-up.
 */
export function EntityTimeline({
  organizationId,
  target,
  canWrite,
}: {
  organizationId: string;
  target: TimelineTarget;
  canWrite: boolean;
}) {
  const { message } = App.useApp();
  const { token } = theme.useToken();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      listActivities(organizationId, target),
      listNotes(organizationId, target),
      listAttachments(organizationId, target),
    ])
      .then(([nextActivities, nextNotes, nextAttachments]) => {
        if (cancelled) return;
        setActivities(nextActivities);
        setNotes(nextNotes);
        setAttachments(nextAttachments);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setActivities([]);
        setNotes([]);
        setAttachments([]);
        setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // target identity changes when entityId changes — re-fetch then.
  }, [organizationId, target.entityType, target.entityId, reloadToken]);

  async function submitNote() {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    try {
      await addNote(organizationId, { ...target, body });
      setDraft('');
      message.success('Note added');
      setReloadToken((value) => value + 1);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(id: string) {
    setDeletingId(id);
    try {
      await deleteNote(id);
      message.success('Note deleted');
      setReloadToken((value) => value + 1);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  const uploadProps: UploadProps = {
    customRequest: async (options) => {
      const { file, onSuccess, onError } = options;
      const actualFile = file as File;
      setUploading(true);
      try {
        const ext = actualFile.name.split('.').pop();
        const path = `${organizationId}/${target.entityType}/${target.entityId}/${crypto.randomUUID()}.${ext}`;
        const { data, error: uploadError } = await supabase.storage.from('attachments').upload(path, actualFile);
        if (uploadError) throw uploadError;
        
        await recordAttachment(organizationId, {
          ...target,
          bucket: 'attachments',
          path: data.path,
          fileName: actualFile.name,
          mimeType: actualFile.type || undefined,
          sizeBytes: actualFile.size,
        });
        
        message.success('Attachment uploaded');
        setReloadToken((v) => v + 1);
        if (onSuccess) onSuccess('ok');
      } catch (err) {
        message.error(getErrorMessage(err));
        if (onError) onError(err as Error);
      } finally {
        setUploading(false);
      }
    },
    showUploadList: false,
  };

  async function removeAttachment(id: string) {
    setDeletingAttachmentId(id);
    try {
      await deleteAttachment(id);
      message.success('Attachment deleted');
      setReloadToken((value) => value + 1);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setDeletingAttachmentId(null);
    }
  }
  
  async function downloadAttachment(attachment: Attachment) {
    try {
      const { data, error: downloadError } = await supabase.storage.from(attachment.bucket).createSignedUrl(attachment.path, 60);
      if (downloadError) throw downloadError;
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      message.error('Could not download file: ' + getErrorMessage(err));
    }
  }

  if (error) {
    return <Alert type="error" showIcon title={error} />;
  }

  const notesTab = (
    <Flex vertical gap={12}>
      {canWrite ? (
        <Flex vertical gap={8}>
          <Input.TextArea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a note about this opportunity…"
            autoSize={{ minRows: 2, maxRows: 6 }}
            maxLength={10_000}
          />
          <Flex justify="flex-end">
            <Button type="primary" loading={saving} disabled={!draft.trim()} onClick={() => void submitNote()}>
              Add note
            </Button>
          </Flex>
        </Flex>
      ) : null}

      {loading && notes.length === 0 ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : notes.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notes yet." />
      ) : (
        <List
          dataSource={notes}
          renderItem={(note) => (
            <List.Item
              actions={
                canWrite
                  ? [
                      <Popconfirm
                        key="delete"
                        title="Delete this note?"
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void removeNote(note.id)}
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          loading={deletingId === note.id}
                        />
                      </Popconfirm>,
                    ]
                  : undefined
              }
            >
              <Flex vertical gap={4} style={{ width: '100%' }}>
                <Flex align="center" gap={8} wrap>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDateTime(note.createdAt)}
                  </Text>
                  {note.isAiGenerated ? (
                    <Tag color="cyan" variant="filled" icon={<RobotOutlined />}>
                      AI
                    </Tag>
                  ) : null}
                </Flex>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{note.body}</Paragraph>
              </Flex>
            </List.Item>
          )}
        />
      )}
    </Flex>
  );

  const activityTab =
    loading && activities.length === 0 ? (
      <Skeleton active paragraph={{ rows: 4 }} />
    ) : activities.length === 0 ? (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity yet." />
    ) : (
      <Timeline
        items={activities.map((activity) => {
          const meta = ACTIVITY_ICON[activity.type];
          return {
            color: meta.color,
            dot: meta.icon,
            children: (
              <Flex vertical gap={2}>
                <Text>{activity.summary}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatDateTime(activity.createdAt)}
                </Text>
              </Flex>
            ),
          };
        })}
      />
    );

  const attachmentsTab = (
    <Flex vertical gap={12}>
      {canWrite ? (
        <Flex justify="flex-end">
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} loading={uploading}>
              Upload File
            </Button>
          </Upload>
        </Flex>
      ) : null}

      {loading && attachments.length === 0 ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : attachments.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No attachments yet." />
      ) : (
        <List
          dataSource={attachments}
          renderItem={(attachment) => (
            <List.Item
              actions={[
                <Button key="download" type="link" size="small" icon={<DownloadOutlined />} onClick={() => void downloadAttachment(attachment)} />,
                canWrite ? (
                  <Popconfirm
                    key="delete"
                    title="Delete this attachment?"
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void removeAttachment(attachment.id)}
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={deletingAttachmentId === attachment.id} />
                  </Popconfirm>
                ) : null,
              ].filter((a) => a !== null) as React.ReactNode[]}
            >
              <List.Item.Meta
                avatar={<PaperClipOutlined style={{ fontSize: 20, color: token.colorTextSecondary }} />}
                title={attachment.fileName}
                description={
                  <Flex gap={16}>
                    <span>{formatDateTime(attachment.createdAt)}</span>
                    {attachment.sizeBytes && <span>{(attachment.sizeBytes / 1024).toFixed(1)} KB</span>}
                  </Flex>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Flex>
  );

  return (
    <div style={{ background: token.colorFillQuaternary, borderRadius: token.borderRadiusLG, padding: 12 }}>
      <Tabs
        size="small"
        items={[
          { key: 'notes', label: `Notes${notes.length ? ` (${notes.length})` : ''}`, children: notesTab },
          { key: 'attachments', label: `Attachments${attachments.length ? ` (${attachments.length})` : ''}`, children: attachmentsTab },
          { key: 'activity', label: 'Activity', children: activityTab },
        ]}
      />
    </div>
  );
}
