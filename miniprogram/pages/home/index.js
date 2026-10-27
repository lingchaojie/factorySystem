const api = require('../../utils/api');
Page({
  data: { loggedIn: false },
  onShow() {
    const loggedIn = !!api.session();
    this.setData({ loggedIn });
  },
  enter() {
    if (api.session()) wx.switchTab({ url: '/pages/workbench/index' });
    else wx.navigateTo({ url: '/pages/login/index' });
  }
});
