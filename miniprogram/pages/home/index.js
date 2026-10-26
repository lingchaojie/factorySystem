const api = require('../../utils/api');
Page({
  data: { loggedIn: false },
  onShow() {
    const loggedIn = !!api.session();
    this.setData({ loggedIn });
    if (loggedIn) wx.showTabBar(); else wx.hideTabBar();
  },
  enter() {
    if (api.session()) wx.switchTab({ url: '/pages/assistant/index' });
    else wx.navigateTo({ url: '/pages/login/index' });
  }
});
