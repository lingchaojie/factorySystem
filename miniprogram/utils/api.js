const { defaultServer, connection = {} } = require('../config');
const SERVER_KEY = 'factory_server';
const SESSION_KEY = 'factory_session';
const SESSION_CONNECTION_KEY = 'factory_session_connection';
let cloudInitialized = false;

function isCloud() { return connection.mode === 'cloud'; }
function connectionKey() {
  if (isCloud()) return 'function:' + connection.env + ':' + connection.functionName;
  return 'http:' + getServer();
}
function connectionInfo() {
  return { cloud: isCloud(), label: isCloud() ? '工厂云服务' : getServer() };
}
function initCloud() {
  if (!isCloud() || cloudInitialized) return;
  if (!connection.env || !connection.functionName) throw new Error('云服务尚未配置完成，请联系管理员');
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') throw new Error('请更新微信后再使用云服务');
  wx.cloud.init({ env: connection.env, traceUser: false });
  cloudInitialized = true;
}

function normalizeServer(value) {
  const server = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(server)) {
    throw new Error('请填写 http://服务器IP:端口，不要附加页面路径');
  }
  return server;
}
function getServer() { return wx.getStorageSync(SERVER_KEY) || defaultServer; }
function session() {
  const value = wx.getStorageSync(SESSION_KEY) || null;
  const owner = wx.getStorageSync(SESSION_CONNECTION_KEY);
  // 旧 IP Demo 会话只可继续用于 HTTP，不能向新的云环境发送旧令牌。
  if (value && (owner ? owner !== connectionKey() : isCloud())) {
    clearSession(); return null;
  }
  return value;
}
function clearSession() { wx.removeStorageSync(SESSION_KEY); wx.removeStorageSync(SESSION_CONNECTION_KEY); }
function saveServer(value) {
  if (isCloud()) throw new Error('云服务地址由管理员配置');
  const server = normalizeServer(value);
  if (server !== getServer()) clearSession();
  wx.setStorageSync(SERVER_KEY, server);
  return server;
}
function saveSession(value) {
  wx.setStorageSync(SESSION_CONNECTION_KEY, connectionKey());
  wx.setStorageSync(SESSION_KEY, value);
}
function requireAuth() {
  if (session()) return true;
  wx.reLaunch({ url: '/pages/login/index' });
  return false;
}
function request(path, options) {
  options = options || {};
  const auth = options.auth !== false;
  const token = auth && session() && session().token;
  return new Promise((resolve, reject) => {
    const requestOptions = {
      method: options.method || 'GET', data: options.data,
      timeout: 15000,
      header: Object.assign({ 'content-type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      success(response) {
        if (!response || typeof response.statusCode !== 'number') {
          const error = new Error('云服务响应异常，请先核对提交结果');
          error.uncertain = options.method === 'POST';
          reject(error); return;
        }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          if (!response.data || typeof response.data !== 'object') {
            reject(new Error('服务器响应异常，请确认已部署小程序接口')); return;
          }
          resolve(response.data); return;
        }
        if (response.statusCode === 401 && auth) {
          clearSession(); wx.reLaunch({ url: '/pages/login/index' });
        }
        const error = new Error(response.data && response.data.error || '请求失败（' + response.statusCode + '）');
        error.status = response.statusCode;
        reject(error);
      },
      fail() {
        const error = new Error(isCloud() ? '云服务连接失败，请稍后重试或联系管理员' : '连接失败：检查 IP、端口、安全组和手机调试模式');
        error.uncertain = options.method === 'POST';
        reject(error);
      }
    };
    if (isCloud()) {
      // 失败时不回退 HTTP，也不重试，避免泄露凭据或重复写入加工/出货。
      try { initCloud(); }
      catch (error) { reject(error); return; }
      Promise.resolve().then(() => wx.cloud.callFunction({
        config: { env: connection.env }, name: connection.functionName,
        data: { method: requestOptions.method, path, body: options.data, token: token || undefined }
      })).then(response => requestOptions.success(response && response.result), requestOptions.fail);
    } else {
      wx.request(Object.assign({ url: getServer() + '/api/miniapp' + path }, requestOptions));
    }
  });
}
module.exports = { normalizeServer, getServer, connectionInfo, initCloud, session, saveServer, saveSession, clearSession, requireAuth, request };
