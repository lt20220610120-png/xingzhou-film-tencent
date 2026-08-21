const net = require('node:net');
const tls = require('node:tls');

const b64 = (value) => Buffer.from(String(value), 'utf8').toString('base64');
// base64 正文需按 76 字符折行，否则部分邮件服务器会拒收或截断。
const b64Body = (value) => (b64(value).match(/.{1,76}/g) || ['']).join('\r\n');

function buildMessage({ from, to, subject, text, html }) {
  const boundary = 'xz_' + Date.now().toString(36);
  const head = [
    `From: =?UTF-8?B?${b64('行舟影视')}?= <${from}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
  ];
  if (!html) {
    return [...head, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64Body(text)].join('\r\n');
  }
  return [
    ...head,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Body(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Body(html),
    `--${boundary}--`,
  ].join('\r\n');
}

// 极简 SMTP 客户端：只用于发送验证码邮件，凭据只来自服务器环境变量。
function createMailer(env = process.env) {
  const host = String(env.SMTP_HOST || '').trim();
  const user = String(env.SMTP_USER || '').trim();
  const pass = String(env.SMTP_PASS || '');
  const from = String(env.SMTP_FROM || user).trim();
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT || 465);
  const secure = String(env.SMTP_SECURE || 'true') !== 'false';

  const sendMail = (message) => new Promise((resolve, reject) => {
    const script = [
      'EHLO xingzhou\r\n',
      'AUTH LOGIN\r\n',
      `${b64(user)}\r\n`,
      `${b64(pass)}\r\n`,
      `MAIL FROM:<${from}>\r\n`,
      `RCPT TO:<${message.to}>\r\n`,
      'DATA\r\n',
      `${buildMessage({ ...message, from })}\r\n.\r\n`,
      'QUIT\r\n',
    ];
    const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    let buffer = '';
    let step = 0;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(true);
    };
    socket.setTimeout(20000, () => finish(new Error('SMTP 超时')));
    socket.on('error', () => finish(new Error('SMTP 连接失败')));
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!buffer.endsWith('\r\n')) return;
      const lines = buffer.trimEnd().split('\r\n');
      const last = lines[lines.length - 1];
      // 多行响应（250-xxx）尚未结束，继续等待。
      if (/^\d{3}-/.test(last)) return;
      buffer = '';
      if (Number(last.slice(0, 3)) >= 400) return finish(new Error(`SMTP 拒绝：${last.slice(0, 3)}`));
      if (step >= script.length) return finish(null);
      socket.write(script[step]);
      step += 1;
    });
  });

  return { sendMail };
}

module.exports = { createMailer, buildMessage };
