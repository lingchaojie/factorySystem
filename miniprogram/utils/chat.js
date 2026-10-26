function bytes(text) {
  let count = 0;
  for (const character of text) {
    const code = character.codePointAt(0);
    count += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return count;
}
function buildQuery(messages, message, requestId) {
  const history = messages.filter(m => m.id !== 'welcome' && !m.failed).slice(-8)
    .map(m => ({ role: m.role, content: m.text.slice(0, 1600) }));
  const body = { message, history, requestId, consent: true };
  // Leave room for the gateway envelope under its 16 KiB business-body limit.
  while (history.length && bytes(JSON.stringify(body)) > 12000) history.shift();
  return body;
}
module.exports = { buildQuery };
