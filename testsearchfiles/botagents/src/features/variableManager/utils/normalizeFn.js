export default function normalizeFn(fnString, apis = []) {
  if (!fnString || typeof fnString !== 'string') return fnString;

  const varPattern = /(\n\s*)(const|let)\s+(\w+)\s*=\s*storeVars\.(\w+)/g;
  let result = fnString;
  const replacements = [];
  let match;

  while ((match = varPattern.exec(fnString)) !== null) {
    replacements.push({
      index: match.index,
      fullMatch: match[0],
      indent: match[1],
      declaration: match[2],
      varName: match[3],
      storeVarName: match[4]
    });
  }

  for (let i = replacements.length - 1; i >= 0; i--) {
    const { index, fullMatch, indent, storeVarName } = replacements[i];
    let matchedApi = null;
    const searchName = storeVarName.toLowerCase();

    if (Array.isArray(apis) && apis.length > 0) {
      matchedApi = apis.find((api) => {
        if (!api) return false;
        const apiName = (api.name || '').toLowerCase();
        if (apiName === searchName) return true;
        if (Array.isArray(api.tag)) {
          return api.tag.some((tag) => (tag || '').toLowerCase() === searchName);
        }
        return false;
      });
    }

    if (matchedApi) {
      const apiName = matchedApi.name || '';
      const apiUrl = matchedApi.url || '';
      const storeLocation = `storeVars["${apiName}"]`;
      const apiLog = `${indent}console.log("requestAPI", "${apiName}", "${apiUrl}", {}, "${storeLocation}");`;
      const replacement = `${apiLog}${fullMatch}`;
      result = result.substring(0, index) + replacement + result.substring(index + fullMatch.length);
    }
  }

  return result;
}
