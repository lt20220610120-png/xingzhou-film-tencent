const test = require('node:test');
const assert = require('node:assert/strict');
const { createProjectWindowTickets } = require('./production-project-window.cjs');

test('only an authorized, single-use blank project popup can open', () => {
  let now = 0;
  const tickets = createProjectWindowTickets(() => now);
  const token = tickets.issue();
  assert.equal(tickets.consume({url:'https://example.org',frameName:token}),false);
  assert.equal(tickets.consume({url:'about:blank',frameName:'project-not-authorized'}),false);
  assert.equal(tickets.consume({url:'about:blank',frameName:token}),true);
  assert.equal(tickets.consume({url:'about:blank',frameName:token}),false);
  const expired=tickets.issue();
  now += 60000;
  assert.equal(tickets.consume({url:'about:blank',frameName:expired}),false);
});
