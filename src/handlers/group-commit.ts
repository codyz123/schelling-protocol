import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "../types.js";
import { getCluster } from "../clusters/registry.js";

export interface GroupCommitInput {
  user_token: string;
  action: "create" | "join" | "leave";
  cluster_id?: string;
  group_id?: string;
  member_tokens?: string[]; // for create
}

export interface GroupCommitOutput {
  group_id: string;
  status: string;
  members: Array<{ user_token: string; committed: boolean }>;
}

export async function handleGroupCommit(
  input: GroupCommitInput,
  ctx: HandlerContext
): Promise<HandlerResult<GroupCommitOutput>> {
  const caller = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?").get(input.user_token);
  if (!caller) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
  }

  if (input.action === "create") {
    if (!input.cluster_id || !input.member_tokens || input.member_tokens.length === 0) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "cluster_id and member_tokens required for create" } };
    }

    const cluster = getCluster(input.cluster_id);
    if (!cluster) {
      return { ok: false, error: { code: "UNKNOWN_CLUSTER", message: `Unknown cluster: ${input.cluster_id}` } };
    }
    if (!cluster.group_size) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `Cluster '${input.cluster_id}' does not support groups` } };
    }

    const allMembers = [input.user_token, ...input.member_tokens.filter(t => t !== input.user_token)];
    if (allMembers.length < cluster.group_size.min || allMembers.length > cluster.group_size.max) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `Group size must be between ${cluster.group_size.min} and ${cluster.group_size.max}` } };
    }

    // Verify all members exist
    for (const token of allMembers) {
      const exists = ctx.db.prepare("SELECT 1 FROM users WHERE user_token = ?").get(token);
      if (!exists) {
        return { ok: false, error: { code: "USER_NOT_FOUND", message: `User ${token} not found` } };
      }
    }

    const groupId = randomUUID();
    ctx.db.prepare("INSERT INTO groups (id, cluster_id, created_by, status) VALUES (?, ?, ?, 'proposed')").run(groupId, input.cluster_id, input.user_token);

    for (const token of allMembers) {
      const committed = token === input.user_token ? 1 : 0;
      ctx.db.prepare("INSERT INTO group_members (id, group_id, user_token, committed, committed_at) VALUES (?, ?, ?, ?, ?)").run(
        randomUUID(), groupId, token, committed, committed ? new Date().toISOString() : null
      );
    }

    const members = ctx.db.prepare("SELECT user_token, committed FROM group_members WHERE group_id = ?").all(groupId) as Array<{ user_token: string; committed: number }>;

    return {
      ok: true,
      data: {
        group_id: groupId,
        status: "proposed",
        members: members.map(m => ({ user_token: m.user_token, committed: m.committed === 1 })),
      },
    };
  }

  if (input.action === "join") {
    if (!input.group_id) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "group_id required for join" } };
    }

    const group = ctx.db.prepare("SELECT * FROM groups WHERE id = ?").get(input.group_id) as any;
    if (!group) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "Group not found" } };
    }
    if (group.status !== "proposed") {
      return { ok: false, error: { code: "INVALID_INPUT", message: `Cannot join group with status: ${group.status}` } };
    }

    const membership = ctx.db.prepare("SELECT * FROM group_members WHERE group_id = ? AND user_token = ?").get(input.group_id, input.user_token) as any;
    if (!membership) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "You are not a member of this group" } };
    }

    ctx.db.prepare("UPDATE group_members SET committed = 1, committed_at = datetime('now') WHERE group_id = ? AND user_token = ?").run(input.group_id, input.user_token);

    // Check if all members committed
    const uncommitted = ctx.db.prepare("SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND committed = 0").get(input.group_id) as { count: number };
    if (uncommitted.count === 0) {
      ctx.db.prepare("UPDATE groups SET status = 'complete', completed_at = datetime('now') WHERE id = ?").run(input.group_id);
    }

    const updatedGroup = ctx.db.prepare("SELECT status FROM groups WHERE id = ?").get(input.group_id) as { status: string };
    const members = ctx.db.prepare("SELECT user_token, committed FROM group_members WHERE group_id = ?").all(input.group_id) as Array<{ user_token: string; committed: number }>;

    return {
      ok: true,
      data: {
        group_id: input.group_id,
        status: updatedGroup.status,
        members: members.map(m => ({ user_token: m.user_token, committed: m.committed === 1 })),
      },
    };
  }

  if (input.action === "leave") {
    if (!input.group_id) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "group_id required for leave" } };
    }

    const group = ctx.db.prepare("SELECT * FROM groups WHERE id = ?").get(input.group_id) as any;
    if (!group) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "Group not found" } };
    }

    ctx.db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_token = ?").run(input.group_id, input.user_token);

    const cluster = getCluster(group.cluster_id);
    const remaining = ctx.db.prepare("SELECT COUNT(*) as count FROM group_members WHERE group_id = ?").get(input.group_id) as { count: number };

    if (remaining.count < (cluster?.group_size?.min ?? 2)) {
      ctx.db.prepare("UPDATE groups SET status = 'dissolved' WHERE id = ?").run(input.group_id);
    }

    const updatedGroup = ctx.db.prepare("SELECT status FROM groups WHERE id = ?").get(input.group_id) as { status: string };
    const members = ctx.db.prepare("SELECT user_token, committed FROM group_members WHERE group_id = ?").all(input.group_id) as Array<{ user_token: string; committed: number }>;

    return {
      ok: true,
      data: {
        group_id: input.group_id,
        status: updatedGroup.status,
        members: members.map(m => ({ user_token: m.user_token, committed: m.committed === 1 })),
      },
    };
  }

  return { ok: false, error: { code: "INVALID_INPUT", message: `Unknown action: ${input.action}` } };
}
