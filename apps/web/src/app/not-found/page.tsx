import { Button, Flex, Result, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

const { Text } = Typography;

export default function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 24 }}>
      <Result
        status="404"
        title="Page not found"
        subTitle="This route is not part of the current Radar workspace."
        extra={[
          <Button key="home" type="primary" onClick={() => navigate('/')}>
            Go to Action Center
          </Button>,
          <Button key="back" onClick={() => navigate(-1)}>
            Go back
          </Button>,
        ]}
      >
        <Text type="secondary">Missing route: {location.pathname}</Text>
      </Result>
    </Flex>
  );
}
