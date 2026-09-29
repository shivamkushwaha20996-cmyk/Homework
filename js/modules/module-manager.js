export const MODULES = Object.freeze({modelDocument:true,excelComparison:true,labKnowledge:true,parameter360:true});
export function isModuleEnabled(name){return MODULES[name]===true}
export function applyModuleVisibility(){document.querySelectorAll('[data-module]').forEach(el=>el.hidden=!isModuleEnabled(el.dataset.module))}
