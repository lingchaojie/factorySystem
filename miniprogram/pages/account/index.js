const api = require('../../utils/api');
Page({
  data: { user: null, server: '', cloud: false, error: '', loading: false },
  async onShow() {
    if (!api.requireAuth()) return;
    const connection = api.connectionInfo();
    this.setData({ user: api.session().user, server: connection.label, cloud: connection.cloud, error: '' });
    try {
      const result = await api.request('/auth/me');
      const current = api.session();
      if (current) { api.saveSession({ token: current.token, user: result.user }); this.setData({ user: result.user }); }
    } catch (error) { this.setData({ error: error.message }); }
  },
  async logout() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try { await api.request('/auth/logout', { method: 'POST' }); }
    catch (error) {
      if (error.status !== 401) {
        this.setData({ loading: false, error: '退出未完成，请检查连接后重试；服务器上的登录令牌尚未确认失效。' });
        return;
      }
    }
    api.clearSession();
    wx.reLaunch({ url: '/pages/login/index' });
    this.setData({ loading: false });
  }
});
