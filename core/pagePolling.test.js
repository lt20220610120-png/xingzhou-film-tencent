import test from 'node:test';
import assert from 'node:assert/strict';
import {createPagePoll} from './pagePolling.js';

function fixture(query, options={}) {
  const page = new EventTarget();
  page.hidden = false;
  const waiting = new Map();
  let id=0;
  const poll=createPagePoll(query,{
    page, delay:100, schedule:(callback,delay)=>{waiting.set(++id,{callback,delay});return id;},
    cancel:key=>waiting.delete(key), ...options,
  });
  return {
    poll, waiting,
    visibility(hidden) {page.hidden=hidden;page.dispatchEvent(new Event('visibilitychange'));},
    fire() {const [key,timer]=waiting.entries().next().value;waiting.delete(key);return timer.callback();},
  };
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('maintains no timer while the page or workspace is hidden and refreshes on return',async()=>{
  let calls=0;
  const view=fixture(()=>{calls++;});
  view.poll.setActive(true);
  await flush();
  assert.equal(calls,1);
  assert.equal(view.waiting.size,1);
  view.visibility(true);
  assert.equal(view.waiting.size,0);
  await view.poll.request();
  assert.equal(calls,1);
  view.visibility(false);
  await flush();
  assert.equal(calls,2);
  view.poll.setActive(false);
  assert.equal(view.waiting.size,0);
  view.visibility(true);
  view.visibility(false);
  await flush();
  assert.equal(calls,2);
  view.poll.setActive(true);
  await flush();
  assert.equal(calls,3);
  view.poll.dispose();
  assert.equal(view.waiting.size,0);
});

test('a slow read gets no repeating timer, and requests for a fresh read coalesce',async()=>{
  const releases=[];
  const states=[];
  const view=fixture(current=>{states.push(current);return new Promise(resolve=>releases.push(resolve));});
  view.poll.setActive(true);
  await flush();
  assert.equal(view.waiting.size,0);
  view.visibility(true);
  assert.equal(states[0](),false);
  view.visibility(false);
  const a=view.poll.request({afterCurrent:true});
  const b=view.poll.request({afterCurrent:true});
  assert.equal(a,b);
  assert.equal(releases.length,1);
  releases.shift()();
  await flush();
  assert.equal(releases.length,1);
  assert.equal(view.waiting.size,0);
  view.poll.dispose();
  assert.equal(states[1](),false);
  releases.shift()('complete');
  assert.equal(await a,'complete');
  assert.equal(view.waiting.size,0);
});

test('manual refresh continues to work with automatic updates turned off',async()=>{
  let calls=0;
  const view=fixture(()=>{calls++;},{repeat:false});
  view.poll.setActive(true);
  await flush();
  assert.equal(calls,1);
  assert.equal(view.waiting.size,0);
  await view.poll.request();
  assert.equal(calls,2);
  view.poll.setRepeat(true);
  assert.equal(view.waiting.size,1);
  await view.fire();
  assert.equal(calls,3);
  view.poll.dispose();
});

test('a view with its own initial request waits until the first poll or the first return from hiding',async()=>{
  let calls=0;
  const view=fixture(()=>{calls++;},{immediate:false});
  view.poll.setActive(true);
  assert.equal(calls,0);
  assert.equal([...view.waiting.values()][0].delay,100);
  view.visibility(true);
  view.visibility(false);
  await flush();
  assert.equal(calls,1);
  view.poll.dispose();
});
