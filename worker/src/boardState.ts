import type { BoardStateRecord, BoardVisibility, Env } from "./types";
import { resolveBoardVisibilityDefault } from "../../shared/ownerRuntime";

const SINGLETON_ID = "singleton";
function createDefaultState(env?: Pick<Env, "BOARD_VISIBILITY_DEFAULT">): BoardStateRecord {
  return {
    id: SINGLETON_ID,
    owner_user_id: null,
    visibility: resolveBoardVisibilityDefault(env?.BOARD_VISIBILITY_DEFAULT),
    claimed_at: null,
    published_at: null
  };
}

export async function ensureBoardState(db: D1Database, env?: Pick<Env, "BOARD_VISIBILITY_DEFAULT">): Promise<void> {
  const defaultVisibility = resolveBoardVisibilityDefault(env?.BOARD_VISIBILITY_DEFAULT);
  await db
    .prepare(
      `INSERT OR IGNORE INTO board_state (id, owner_user_id, visibility, claimed_at, published_at)
       VALUES (?, NULL, ?, NULL, NULL)`
    )
    .bind(SINGLETON_ID, defaultVisibility)
    .run();
}

export async function loadBoardState(db: D1Database, env?: Pick<Env, "BOARD_VISIBILITY_DEFAULT">): Promise<BoardStateRecord> {
  try {
    await ensureBoardState(db, env);
    const row = await db
      .prepare(
        `SELECT id, owner_user_id, visibility, claimed_at, published_at
         FROM board_state
         WHERE id = ?`
      )
      .bind(SINGLETON_ID)
      .first<BoardStateRecord>();

    return row ?? createDefaultState(env);
  } catch {
    return createDefaultState(env);
  }
}

export async function claimBoard(db: D1Database, ownerUserId: string, env?: Pick<Env, "BOARD_VISIBILITY_DEFAULT">): Promise<BoardStateRecord> {
  const claimedAt = new Date().toISOString();
  const defaultVisibility = resolveBoardVisibilityDefault(env?.BOARD_VISIBILITY_DEFAULT);
  await ensureBoardState(db, env);
  await db
    .prepare(
      `UPDATE board_state
       SET owner_user_id = ?, visibility = ?, claimed_at = COALESCE(claimed_at, ?), published_at = CASE WHEN ? = 'public' THEN COALESCE(published_at, ?) ELSE NULL END
       WHERE id = ?`
    )
    .bind(ownerUserId, defaultVisibility, claimedAt, defaultVisibility, claimedAt, SINGLETON_ID)
    .run();

  return loadBoardState(db, env);
}

export async function clearBoardClaim(db: D1Database, env?: Pick<Env, "BOARD_VISIBILITY_DEFAULT">): Promise<BoardStateRecord> {
  const defaultVisibility = resolveBoardVisibilityDefault(env?.BOARD_VISIBILITY_DEFAULT);
  await ensureBoardState(db, env);
  await db
    .prepare(
      `UPDATE board_state
       SET owner_user_id = NULL, visibility = ?, claimed_at = NULL, published_at = CASE WHEN ? = 'public' THEN COALESCE(published_at, ?) ELSE NULL END
       WHERE id = ?`
    )
    .bind(defaultVisibility, defaultVisibility, new Date().toISOString(), SINGLETON_ID)
    .run();

  return loadBoardState(db, env);
}

export async function setBoardVisibility(db: D1Database, visibility: BoardVisibility, env?: Pick<Env, "BOARD_VISIBILITY_DEFAULT">): Promise<BoardStateRecord> {
  const nowIso = new Date().toISOString();
  await ensureBoardState(db, env);
  await db
    .prepare(
      `UPDATE board_state
       SET visibility = ?, published_at = CASE WHEN ? = 'public' THEN COALESCE(published_at, ?) ELSE NULL END
       WHERE id = ?`
    )
    .bind(visibility, visibility, nowIso, SINGLETON_ID)
    .run();

  return loadBoardState(db, env);
}

export async function isBoardClaimed(db: D1Database, env?: Pick<Env, "BOARD_VISIBILITY_DEFAULT">): Promise<boolean> {
  const state = await loadBoardState(db, env);
  return Boolean(state.owner_user_id);
}

export async function isBoardPublic(db: D1Database, env?: Pick<Env, "BOARD_VISIBILITY_DEFAULT">): Promise<boolean> {
  const state = await loadBoardState(db, env);
  return state.visibility === "public";
}

export async function getBoardStateWithDefaults(db: D1Database, env?: Pick<Env, "BOARD_VISIBILITY_DEFAULT">): Promise<BoardStateRecord> {
  return loadBoardState(db, env);
}

export function getDefaultBoardState(env?: Pick<Env, "BOARD_VISIBILITY_DEFAULT">): BoardStateRecord {
  return createDefaultState(env);
}
