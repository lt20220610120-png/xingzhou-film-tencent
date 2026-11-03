const {randomUUID} = require('node:crypto');
function createProjectWindowTickets(now = Date.now) {
  const tickets = new Map();
  function issue() {
    for (const [name, expiry] of tickets) if (expiry <= now()) tickets.delete(name);
    const name = 'xz-production-' + randomUUID();
    tickets.set(name, now() + 15000);
    return name;
  }
  function consume({url, frameName}) {
    if (url !== 'about:blank' || !tickets.has(frameName)) return false;
    const expiry = tickets.get(frameName);
    tickets.delete(frameName);
    return expiry > now();
  }
  return {issue, consume};
}
module.exports = {createProjectWindowTickets};
