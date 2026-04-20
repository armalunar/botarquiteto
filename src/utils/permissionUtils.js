const { PermissionFlagsBits } = require('discord.js');

function normalizeRoleIds(value) {
    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return Array.from(
            new Set(
                value
                    .map(item => String(item || '').trim())
                    .filter(item => /^\d{17,20}$/.test(item))
            )
        );
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return /^\d{17,20}$/.test(trimmed) ? [trimmed] : [];
    }

    return [];
}

function memberHasAnyRole(member, roleIds) {
    if (!member?.roles?.cache || !Array.isArray(roleIds) || roleIds.length === 0) {
        return false;
    }

    return roleIds.some(roleId => member.roles.cache.has(roleId));
}

function isStaffMember(member, { staffRoleIds = [], supportRoleId = null } = {}) {
    if (!member) {
        return false;
    }

    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) {
        return true;
    }

    if (memberHasAnyRole(member, staffRoleIds)) {
        return true;
    }

    if (supportRoleId && member.roles?.cache?.has?.(supportRoleId)) {
        return true;
    }

    return false;
}

module.exports = {
    normalizeRoleIds,
    memberHasAnyRole,
    isStaffMember
};

