const IMAGE_COMPOSITIONS=new Set(['portrait-four','portrait-five']);
function validateImageComposition(value){
 if(typeof value!=='string'||!IMAGE_COMPOSITIONS.has(value))throw Object.assign(new Error('请选择有效的人物构图模板'),{status:400});
 return value;
}
module.exports={validateImageComposition};
