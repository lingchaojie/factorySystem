const api = require('../../utils/api');
const { buildQuery, queryTime } = require('../../utils/chat');
const greeting = { id: 'welcome', role: 'assistant', text: '你好，我是工厂助手。\n可以查询机器和订单进度，也能查看交期风险、今日待办与待出货清单。\n经理还可以说“让员工姓名跟进某个订单”，直接创建指派事项。', sources: [] };
Page({
  data: { messages: [greeting], draft: '', busy: false, configured: false, canAssign: false, checking: true, error: '',
    pendingJob: '', bottomId: 'message-welcome', suggestions: ['今天有哪些交期风险和待办？', '列出待出货清单', '帮我查一下 CNC-01 的进度'] },
  onShow() {
    this.active = true;
    if (!api.requireAuth()) return;
    const token = api.session().token;
    if (this.owner !== token) {
      this.stopPoll(); this.owner = token; this.submission = null;
      this.setData({ messages: [greeting], draft: '', busy: false, pendingJob: '', error: '' });
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
      if (this.owns(token)) this.setData({ configured: info.configured, canAssign: !!info.canAssign, checking: false, error: '' });
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
    const retry = this.submission && this.submission.text === text && this.submission.token === token;
    const requestId = retry ? this.submission.requestId : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
    const body = retry ? this.submission.body : buildQuery(this.data.messages, text, requestId);
    this.submission = { token, text, requestId, body };
    if (!retry) this.add({ id: requestId, role: 'user', text, sources: [] });
    this.setData({ draft: '' });
    try {
      const result = await api.request('/assistant', { method: 'POST', data: body });
      if (!this.owns(token)) return;
      this.deadline = Date.now() + 90000;
      this.setData({ pendingJob: result.job.id });
      if (this.active) this.watch(result.job.id, token);
    } catch (error) {
      if (this.owns(token)) { this.setData({ busy: false, draft: text, error: error.uncertain ? '请求结果尚未确认。指派事项请先到工作台核对；再次发送相同内容会复用请求编号。' : error.message }); if (!error.uncertain) this.submission = null; }
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
          this.submission = null;
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
    if (['machine', 'order', 'task'].includes(kind) && /^[a-zA-Z0-9_-]{1,128}$/.test(id)) wx.navigateTo({ url: '/pages/' + kind + '/index?id=' + encodeURIComponent(id) });
  },
  clear() {
    if (this.data.busy) return;
    this.setData({ messages: [greeting], error: '', draft: '', bottomId: 'message-welcome' });
  }
});
