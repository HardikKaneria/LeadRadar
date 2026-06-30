import { Flex, Spin } from 'antd';

/** Centered loading state shown while a lazy-loaded route chunk is fetched. */
export function RouteFallback() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: '40vh', width: '100%' }}>
      <Spin size="large" />
    </Flex>
  );
}
