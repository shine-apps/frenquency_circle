export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/login/index',
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
  },
  // 微信合规要求:调用 getLocation / chooseLocation 等隐私接口
  // 必须在 requiredPrivateInfos 中声明,否则报
  // "getLocation:fail the api need to be declared in the requiredPrivateInfos field"
  requiredPrivateInfos: [
    'getLocation',
    'chooseLocation'
  ]
})
