const api = require('../../utils/api');
Page({
  data: { server: '', username: '', password: '', loading: false, error: '' },
  onLoad() {
    this.setData({ server: api.getServer() });
    if (api.session()) wx.switchTab({ url: '/pages/machines/index' });
  },
  field(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  async login() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      if (!this.data.username.trim() || !this.data.password) throw new Error('请输入账号和密码');
      api.saveServer(this.data.server);
      const result = await api.request('/auth/login', { method: 'POST', auth: false,
        data: { username: this.data.username.trim(), password: this.data.password } });
      api.saveSession(result);
      this.setData({ password: '' });
      wx.switchTab({ url: '/pages/machines/index' });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  }
});
