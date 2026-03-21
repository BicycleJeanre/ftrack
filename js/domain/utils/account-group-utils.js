// account-group-utils.js
// Helpers for non-postable account groups and rollup expansion.

function toNumberId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function normalizeAccountGroups(rawGroups) {
  const groups = Array.isArray(rawGroups) ? rawGroups : [];
  return groups.map((group) => {
    const id = toNumberId(group?.id);
    const name = typeof group?.name === 'string' ? group.name : '';
    const parentGroupId = toNumberId(group?.parentGroupId);
    const accountIds = Array.isArray(group?.accountIds)
      ? Array.from(new Set(group.accountIds.map(toNumberId).filter(Boolean)))
      : [];
    const sortOrder = Number.isFinite(Number(group?.sortOrder)) ? Number(group.sortOrder) : 0;

    return {
      id,
      name,
      parentGroupId,
      accountIds,
      sortOrder
    };
  }).filter((group) => group.id);
}

export function buildAccountGroupIndex(groups) {
  const normalized = normalizeAccountGroups(groups);
  return new Map(normalized.map((group) => [group.id, group]));
}

export function getGroupById(groups, groupId) {
  const id = toNumberId(groupId);
  if (!id) return null;
  return buildAccountGroupIndex(groups).get(id) || null;
}

export function resolveDescendantGroupIds(groups, groupId) {
  const index = buildAccountGroupIndex(groups);
  const rootId = toNumberId(groupId);
  if (!rootId || !index.has(rootId)) return new Set();

  const childrenByParent = new Map();
  index.forEach((group) => {
    const parentId = toNumberId(group.parentGroupId);
    if (!parentId) return;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(group.id);
  });

  const visited = new Set();
  const queue = [rootId];
  while (queue.length) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const children = childrenByParent.get(currentId) || [];
    children.forEach((childId) => {
      if (!visited.has(childId)) queue.push(childId);
    });
  }
  return visited;
}

export function getGroupAccountIds(groups, groupId) {
  const index = buildAccountGroupIndex(groups);
  const groupIds = resolveDescendantGroupIds(groups, groupId);
  const accountIds = new Set();

  groupIds.forEach((id) => {
    const group = index.get(id);
    if (!group) return;
    (group.accountIds || []).forEach((accountId) => {
      const nextId = toNumberId(accountId);
      if (nextId) accountIds.add(nextId);
    });
  });

  return accountIds;
}

export function validateAccountGroups(groups) {
  const normalized = normalizeAccountGroups(groups);
  const index = new Map(normalized.map((group) => [group.id, group]));
  const errors = [];

  normalized.forEach((group) => {
    const parentId = toNumberId(group.parentGroupId);
    if (!parentId) return;
    if (!index.has(parentId)) {
      errors.push({
        type: 'missing_parent',
        groupId: group.id,
        parentGroupId: parentId,
        message: `Group ${group.id} references missing parent ${parentId}.`
      });
    }
  });

  const visitState = new Map(); // 0=unseen,1=visiting,2=done
  const dfs = (groupId, stack = []) => {
    const state = visitState.get(groupId) || 0;
    if (state === 1) {
      const cycleStart = stack.indexOf(groupId);
      const cyclePath = cycleStart >= 0 ? stack.slice(cycleStart).concat(groupId) : stack.concat(groupId);
      errors.push({
        type: 'cycle',
        groupId,
        path: cyclePath,
        message: `Account group cycle detected: ${cyclePath.join(' -> ')}`
      });
      return;
    }
    if (state === 2) return;

    visitState.set(groupId, 1);
    const group = index.get(groupId);
    const parentId = toNumberId(group?.parentGroupId);
    if (group && parentId && index.has(parentId)) {
      dfs(parentId, stack.concat(groupId));
    }
    visitState.set(groupId, 2);
  };

  normalized.forEach((group) => dfs(group.id));
  return errors;
}
