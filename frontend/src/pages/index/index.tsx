import React from 'react';
import { View, Text } from '@tarojs/components';
import { Button, Cell } from '@nutui/nutui-react-taro';
import CustomTabBar from '@/components/CustomTabBar';
import styles from './index.module.scss';

const IndexPage: React.FC = () => {
  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <Text className={styles.title}>Taro + NutUI</Text>
        <Text className={styles.subtitle}>脚手架集成成功</Text>
      </View>
      <View className={styles.section}>
        <Cell title="UI 库" value="@nutui/nutui-react-taro v3" />
        <Cell title="框架" value="Taro 4.1.9 + React 18" />
        <Cell title="目标平台" value="weapp / h5 / tt" />
      </View>
      <View className={styles.actions}>
        <Button type="primary" shape="round">
          Primary Button
        </Button>
        <Button type="default" shape="round">
          Default Button
        </Button>
      </View>
      <CustomTabBar />
    </View>
  );
};

export default IndexPage;
