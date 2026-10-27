const http = require('node:http');
const https = require('node:https');
const { origin } = require('./config');

const MAX_BODY_BYTES = 16384;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 2200; // 为免费云函数的 3 秒执行上限留出余量。
const reply = (statusCode, error) => ({ statusCode, data: { error } });

function input(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('参数无效');
  const method = event.method || 'GET';
  const path = event.path;
  if (!['GET', 'POST'].includes(method) || typeof path !== 'string' || path.length > 2048 || /[\\\s#]/.test(path)) {
    throw new Error('接口或方法无效');
  }
  const pathname = path.split('?')[0];
  const allowed = method === 'GET'
    ? /^\/(?:auth\/me|workbench|tasks(?:\/[A-Za-z0-9_-]{1,128})?|machines(?:\/[A-Za-z0-9_-]{1,128})?|orders(?:\/[A-Za-z0-9_-]{1,128})?|assistant(?:\/jobs\/[A-Za-z0-9_-]{1,128})?)$/
    : /^\/(?:auth\/(?:login|logout)|records|assistant|tasks(?:\/[A-Za-z0-9_-]{1,128}\/status)?)$/;
  if (!allowed.test(pathname)) throw new Error('接口或方法无效');
  if (path.includes('?')) {
    if (method !== 'GET' || !['/orders', '/workbench', '/tasks'].includes(pathname)) throw new Error('查询参数无效');
    const query = new URLSearchParams(path.slice(path.indexOf('?') + 1));
    for (const [key, value] of query) {
      const keys = pathname === '/workbench' ? ['query', 'view', 'page'] : pathname === '/tasks' ? ['status', 'page'] : ['query', 'status'];
      if (!keys.includes(key) || value.length > 512) throw new Error('查询参数无效');
    }
  }
  const login = pathname === '/auth/login';
  if (!login && (typeof event.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(event.token))) {
    return { denied: true };
  }
  let body;
  if (method === 'POST') {
    if (event.body != null && (typeof event.body !== 'object' || Array.isArray(event.body))) throw new Error('请求内容无效');
    body = JSON.stringify(event.body || {});
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error('请求内容过大');
  }
  return { method, path, body, token: login ? null : event.token };
}

// origin 和超时参数只能由受信任的部署代码设置，客户端 event 中的同名字段不会使用。
function createProxy(upstreamOrigin, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const target = new URL(upstreamOrigin);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password ||
      target.pathname !== '/' || target.search || target.hash) throw new Error('上游地址必须是 HTTP(S) origin');
  const transport = target.protocol === 'https:' ? https : http;
  return async function proxy(event) {
    let request;
    try { request = input(event); }
    catch { return reply(400, '请求参数或接口无效'); }
    if (request.denied) return reply(401, '登录已过期，请重新登录');
    return new Promise(resolve => {
      let completed = false;
      let timer;
      const finish = result => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        resolve(result);
      };
      // 不转发客户端任意请求头或 Cookie；业务身份只来自原网站签发的 Bearer token。
      const headers = { 'content-type': 'application/json', accept: 'application/json' };
      if (request.token) headers.Authorization = 'Bearer ' + request.token;
      if (request.body) headers['content-length'] = Buffer.byteLength(request.body);
      const upstream = transport.request(target, {
        method: request.method, path: '/api/miniapp' + request.path, headers,
      }, response => {
        const statusCode = response.statusCode || 502;
        // 不跟随重定向，避免向另一个目标发送账号、令牌和业务数据。
        if (statusCode >= 300 && statusCode < 400) {
          finish(reply(502, '工厂服务地址异常，请联系管理员')); response.destroy(); return;
        }
        if (!/^application\/json(?:;|$)/i.test(response.headers['content-type'] || '')) {
          finish(reply(502, '工厂服务响应异常，请联系管理员')); response.destroy(); return;
        }
        let size = 0;
        const chunks = [];
        response.on('data', chunk => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            finish(reply(502, '工厂服务返回内容过大，请联系管理员')); response.destroy(); return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid JSON response');
            finish({ statusCode, data });
          } catch { finish(reply(502, '工厂服务响应异常，请联系管理员')); }
        });
        response.on('error', () => finish(reply(502, '工厂服务连接中断，请先核对提交结果')));
      });
      timer = setTimeout(() => {
        finish(reply(504, '工厂服务响应超时，请先核对提交结果')); upstream.destroy();
      }, timeoutMs);
      upstream.on('error', () => finish(reply(502, '暂时无法连接工厂服务，请先核对提交结果')));
      // 无重试；上游超时不代表加工/出货写入一定失败。
      upstream.end(request.body);
    });
  };
}

// 普通云调用直接传业务参数；HTTP 网关会将它们包在 event.body 中。
function createHandler(proxy) {
  return async function handler(event) {
    if (!event || typeof event.httpMethod !== 'string') return proxy(event);
    let result;
    try {
      if (event.httpMethod !== 'POST' || !['/', '/factory-proxy'].includes(event.path) ||
          event.isBase64Encoded || typeof event.body !== 'string' ||
          Buffer.byteLength(event.body) > MAX_BODY_BYTES + 4096) throw new Error('invalid HTTP envelope');
      const headers = event.headers || {};
      const contentType = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type');
      if (!contentType || !/^application\/json(?:;|$)/i.test(contentType[1])) throw new Error('invalid content type');
      result = await proxy(JSON.parse(event.body));
    } catch { result = reply(400, '请求参数或接口无效'); }
    return { statusCode: result.statusCode,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify(result.data), isBase64Encoded: false };
  };
}

exports.main = createHandler(createProxy(origin));
exports.createProxy = createProxy;
exports.createHandler = createHandler;
