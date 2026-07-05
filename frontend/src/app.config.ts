export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/index/index',
    'pages/mine/index',
    'pages/profile/index',
    'pages/search/index',
    'pages/publish/index',
    'pages/match/index',
    // Phase 7 新增:圈子与个人中心子页面
    'pages/circle/index',
    'pages/create-circle/index',
    'pages/my-circles/index',
    'pages/my-published/index',
    'pages/privacy/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'MiniApp',
    navigationBarTextStyle: 'black'
  },
  // 定位权限声明(weapp 端生效,H5 端忽略)
  permission: {
    'scope.userLocation': {
      desc: '你的位置信息将用于发现附近的同频圈子和爱好者'
    }
  }
})
