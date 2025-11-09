const Module = require('module');
const path = require('path');
const aliasRoot = path.resolve(__dirname, '..', 'apps', 'api-server');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  if (request.startsWith('@/')) {
    const resolved = path.join(aliasRoot, request.slice(2));
    return originalResolveFilename.call(this, resolved, parent, ...rest);
  }
  return originalResolveFilename.call(this, request, parent, ...rest);
};
