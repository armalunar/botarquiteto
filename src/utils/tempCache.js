// Cache em memória para o fluxo de verificação
const verificationCache = new Map();

module.exports = {
    set: (key, value) => verificationCache.set(key, value),
    get: (key) => verificationCache.get(key),
    delete: (key) => verificationCache.delete(key),
    has: (key) => verificationCache.has(key)
};