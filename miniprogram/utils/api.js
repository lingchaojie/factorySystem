const { defaultServer } = require('../config');
const SERVER_KEY = 'factory_server';
const SESSION_KEY = 'factory_session';

function normalizeServer(value) {
  const server = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(server)) {
    throw new Error('请填写 http://服务器IP:端口，不要附加页面路径');
  }
  return server;
}
function getServer() { return wx.getStorageSync(SERVER_KEY) || defaultServer; }
function session() { return wx.getStorageSync(SESSION_KEY) || null; }
function clearSession() { wx.removeStorageSync(SESSION_KEY); }
function saveServer(value) {
  const server = normalizeServer(value);
  if (server !== getServer()) clearSession();
  wx.setStorageSync(SERVER_KEY, server);
  return server;
}
function saveSession(value) { wx.setStorageSync(SESSION_KEY, value); }
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
    wx.request({
      url: getServer() + '/api/miniapp' + path,
      method: options.method || 'GET', data: options.data,
      timeout: 15000,
      header: Object.assign({ 'content-type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      success(response) {
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
        const error = new Error('连接失败：检查 IP、端口、安全组和手机调试模式');
        error.uncertain = options.method === 'POST';
        reject(error);
      }
    });
  });
}
module.exports = { normalizeServer, getServer, session, saveServer, saveSession, clearSession, requireAuth, request };
