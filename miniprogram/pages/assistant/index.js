const api = require('../../utils/api');
const { buildQuery, queryTime } = require('../../utils/chat');
const greeting = { id: 'welcome', role: 'assistant', text: '你好，我是工厂助手。\n可以查询机器和订单进度，也能查看交期风险、今日待办与待出货清单。', sources: [] };
Page({
  data: { messages: [greeting], draft: '', busy: false, configured: false, checking: true, error: '', providerHost: '', consent: false,
    pendingJob: '', bottomId: 'message-welcome', suggestions: ['今天有哪些交期风险和待办？', '列出待出货清单', '帮我查一下 CNC-01 的进度'] },
  onShow() {
    this.active = true;
    if (!api.requireAuth()) return;
    const token = api.session().token;
    if (this.owner !== token) {
      this.stopPoll(); this.owner = token;
      this.setData({ messages: [greeting], draft: '', busy: false, pendingJob: '', consent: false, error: '' });
    }
    this.check();
    if (this.data.pendingJob) this.watch(this.data.pendingJob, token);
  },
  onHide() { this.active = false; this.stopPoll(); },
  onUnload() { this.disposed = true; this.active = false; this.stopPoll(); },
  stopPoll() { clearTimeout(this.pollTimer); this.pollVersion = (this.pollVersion || 0) + 1; },
  owns(token) { return !this.disposed && api.session() && api.session().token === token && this.owner === token; },
  async check() {
    const token = this.owner;
    this.setData({ checking: true });
    try {
      const info = await api.request('/assistant');
      if (this.owns(token)) this.setData({ configured: info.configured, providerHost: info.providerHost, checking: false, error: '',
        consent: this.data.providerHost === info.providerHost && this.data.consent });
    } catch (error) {
      if (this.owns(token)) this.setData({ configured: false, checking: false, error: error.status === 404 ? '助手服务尚未部署，机器和订单功能可正常使用。' : error.message });
    }
  },
  field(e) { this.setData({ draft: e.detail.value }); },
  suggest(e) { if (!this.data.busy) this.setData({ draft: e.currentTarget.dataset.text }); },
  add(message) {
    const messages = this.data.messages.concat(message).slice(-24);
    this.setData({ messages, bottomId: 'message-' + message.id });
  },
  async send() {
    if (this.data.busy || !api.requireAuth()) return;
    const text = this.data.draft.trim();
    if (!text) return;
    if (this.data.checking || !this.data.configured) { this.setData({ error: '助手尚未接入模型，请先使用机器和订单页面。' }); return; }
    const token = this.owner;
    this.setData({ busy: true, error: '' });
    if (!this.data.consent) {
      const confirmed = await new Promise(resolve => wx.showModal({ title: '使用工厂助手',
        content: '你的问题、最近对话及本次查询到的机器/订单进度，将发送给 ' + this.data.providerHost + ' 及其模型服务生成回答。不发送密码和登录令牌，助手只能查询。是否继续？',
        confirmText: '同意查询', success: r => resolve(r.confirm), fail: () => resolve(false) }));
      if (!this.owns(token)) return;
      if (!confirmed) { this.setData({ busy: false }); return; }
      this.setData({ consent: true });
    }
    const requestId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
    const body = buildQuery(this.data.messages, text, requestId);
    this.add({ id: requestId, role: 'user', text, sources: [] });
    this.setData({ draft: '' });
    try {
      const result = await api.request('/assistant', { method: 'POST', data: body });
      if (!this.owns(token)) return;
      this.deadline = Date.now() + 90000;
      this.setData({ pendingJob: result.job.id });
      if (this.active) this.watch(result.job.id, token);
    } catch (error) {
      if (this.owns(token)) this.setData({ busy: false, error: error.uncertain ? '查询是否创建尚未确认，请稍候再问，避免重复消耗模型额度。' : error.message });
    }
  },
  async watch(id, token) {
    this.stopPoll();
    const version = this.pollVersion;
    const poll = async () => {
      if (!this.active || version !== this.pollVersion || !this.owns(token)) return;
      try {
        const result = await api.request('/assistant/jobs/' + encodeURIComponent(id));
        if (!this.active || version !== this.pollVersion || !this.owns(token)) return;
        if (result.job.state === 'completed') {
          const answer = result.job.answer;
          this.add({ id: id + '-answer', role: 'assistant', text: answer.text, sources: answer.sources,
            time: answer.queriedAt ? queryTime(answer.queriedAt) : '' });
          this.setData({ busy: false, pendingJob: '' }); return;
        }
        if (result.job.state === 'failed') throw new Error(result.job.error || '查询未完成，请稍后再试');
        if (Date.now() > this.deadline) throw new Error('等待回答超时，请稍后重新提问');
        this.pollTimer = setTimeout(poll, 2000);
      } catch (error) {
        if (this.owns(token) && version === this.pollVersion) this.setData({ busy: false, pendingJob: '', error: error.message });
      }
    };
    poll();
  },
  openSource(e) {
    if (!api.requireAuth()) return;
    const { kind, id } = e.currentTarget.dataset;
    if (['machine', 'order'].includes(kind) && /^[a-zA-Z0-9_-]{1,128}$/.test(id)) wx.navigateTo({ url: '/pages/' + kind + '/index?id=' + encodeURIComponent(id) });
  },
  clear() {
    if (this.data.busy) return;
    this.setData({ messages: [greeting], error: '', draft: '', consent: false, bottomId: 'message-welcome' });
  }
});
