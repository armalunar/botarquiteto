const state = new Map();

function get(userId) {
    return state.get(userId) || {};
}

function set(userId, patch) {
    const next = { ...get(userId), ...(patch || {}) };
    state.set(userId, next);
    return next;
}

function clear(userId) {
    state.delete(userId);
}

module.exports = {
    get,
    set,
    clear
};

