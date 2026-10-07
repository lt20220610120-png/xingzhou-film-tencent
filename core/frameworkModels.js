// Existing projects keep their framework default; individual steps override it.
export function frameworkModelSelection(config={},options=[],key='ideas') {
 const stage=key.split(':')[0];
 return [config.modelSelections?.[key],config.modelSelections?.[stage],config.selection].find(selected=>options.some(option=>option.selectionId===selected))||options[0]?.selectionId||'';
}

export function frameworkModelConfig(config={},key,value) {
 return {...config,modelSelections:{...config.modelSelections,[key]:value}};
}
