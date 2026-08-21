const net = require('node:net');
const tls = require('node:tls');

// 极简 SMTP 客户端：只做发送验证码邮件，凭据只来自服务器环境变量。
function createMailer(env = process.env) {
  const host = String(env.SMTP_HOST || '').trim();
  const user = String(env.SMTP_USER || '').trim();
  const pass = String(env.SMTP_PASS || '');
  const from = String(env.SMTP_FROM || user).trim();
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT || 465);
  const secure = String(env.SMTP_SECURE || 'true') !== 'false';

  const sendMail = ({ to, subject, text }) => new Promise((resolve, reject) => {
    const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    let buffer = '';
    let step = 0;
    const encoded = (value) => Buffer.from(String(value), 'utf8').toString('base64');
    const body = [
      `From: =?UTF-8?B?${encoded('行舟影视')}?= <${from}>`,
      `To: <${to}>`,
      `Subject: =?UTF-8?B?${encoded(subject)}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      encoded(text),
      '.',
    ].join('\r\n');
    const script = [
      `EHLO xingzhou\r\n`,
      `AUTH LOGIN\r\n`,
      `${encoded(user)}\r\n`,
      `${encoded(pass)}\r\n`,
      `MAIL FROM:<${from}>\r\n`,
      `RCPT TO:<${to}>\r\n`,
      `DATA\r\n`,
      `${body}\r\n`,
      `QUIT\r\n`,
    ];
    const fail = (reason) => { socket.destroy(); reject(new Error(reason)); };
    socket.setTimeout(15000, () => fail('SMTP 超时'));
    socket.on('error', () => fail('SMTP 连接失败'));
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!/\r\n$/.test(buffer)) return;
      const lines = buffer.trim().split(/\r\n/);
      const last = lines[lines.length - 1];
      buffer = '';
      const code = Number(last.slice(0, 3));
      if (code >= 400) return fail(`SMTP 拒绝：${code}`);
      if (step >= script.length) { socket.end(); return resolve(true); }
      const next = script[step];
      step += 1;
      socket.write(next);
      if (next.startsWith('QUIT')) { socket.end(); resolve(true); }
    });
  });

  return { sendMail };
}

module.exports = { createMailer };
