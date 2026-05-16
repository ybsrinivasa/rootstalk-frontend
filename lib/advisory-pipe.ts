// Batch 39P-b2 (2026-05-16) — UCAT pipe URL helpers.
//
// The Timeline → Practice → Element → Relation → Conditional Question
// shape is identical across the four advisory pipes (CCA, CHA-PG,
// CHA-SP, Q&A) after the Batch 39O backend unification. The only thing
// that differs per pipe is the *URL prefix* — `/advisory/global/
// packages/{pkg_id}/...` for CCA Global vs `/advisory/global/pg-
// recommendations/{pg_id}/...` for CHA-PG Global, etc.
//
// This module centralises those URL builders so the shared authoring
// components (RelationsSection in 39P-b2, CQsSection in 39P-c, etc.)
// can be mounted from any pipe without forking the component for each.

export type AdvisoryPipe =
  | 'CCA_GLOBAL'
  | 'PG_GLOBAL'
  // SP-Global / QA-Global don't ship in V1 (SP is client-only; Q&A is
  // client-only). When they arrive, add their prefixes here.

export interface PipeContext {
  pipe: AdvisoryPipe
  /** The parent's id — package id for CCA, PG-recommendation id for PG. */
  parentId: string
}

function parentSegment(ctx: PipeContext): string {
  switch (ctx.pipe) {
    case 'CCA_GLOBAL':
      return `/advisory/global/packages/${ctx.parentId}`
    case 'PG_GLOBAL':
      return `/advisory/global/pg-recommendations/${ctx.parentId}`
  }
}

export interface RelationEndpoints {
  /** GET — list relations on a timeline. */
  list: (timelineId: string) => string
  /** POST — create a relation on a timeline. */
  create: (timelineId: string) => string
  /** DELETE — drop a relation by id. Pipe-agnostic after Batch 39P-b. */
  delete: (relationId: string) => string
}

export function relationEndpoints(ctx: PipeContext): RelationEndpoints {
  const base = parentSegment(ctx)
  return {
    list: (timelineId) => `${base}/timelines/${timelineId}/relations`,
    create: (timelineId) => `${base}/timelines/${timelineId}/relations`,
    delete: (relationId) => `/advisory/global/relations/${relationId}`,
  }
}
