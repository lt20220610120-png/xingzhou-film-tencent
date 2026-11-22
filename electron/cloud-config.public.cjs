const config=require('../cloud-backend/shared/cloud-config.public.cjs');
module.exports={...config,IP_TLS_CA_FILE:'../cloud-backend/shared/'+config.IP_TLS_CA_FILE};
