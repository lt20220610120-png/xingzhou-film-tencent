const { generateInviteCode, digestInvite } = require('/opt/xingzhou-cloud-backend/src/invites.cjs');
const code = generateInviteCode();
process.stdout.write(JSON.stringify({ code, digest: digestInvite(code) }) + '\n');
