/** Immutable, provenance-first records for the research ledger. */
export interface ResearchEnvelope {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
}
export interface Revisioned extends ResearchEnvelope {
  revision: number;
  previousVersionId?: string | null;
}
export interface TextLocator {
  start: number;
  end: number;
  page?: number;
  section?: string;
}
export type Certainty = "high" | "moderate" | "low" | "very_low" | "not_assessed";
export type ClaimStatus =
  | "draft"
  | "approved"
  | "qualified"
  | "deferred"
  | "rejected"
  | "expired"
  | "withdrawn"
  | "superseded";
export interface AgeRange {
  min: number;
  max: number;
}

export interface TriageSource extends ResearchEnvelope {
  canonicalOrigin: string;
  kind: "web" | "scholarly" | "feed" | "discussion" | "expert";
  access: "public" | "authenticated";
  collectionState: "candidate" | "enabled" | "blocked" | "authentication_required";
  quality:
    | "unassessed"
    | "institutional_guidance"
    | "evidence_publication"
    | "expert_commentary"
    | "audience_discussion"
    | "other";
  rationale: string;
  firstDiscoveredQueryId: string;
  lastCheckedAt: string | null;
  policyVersion: string;
  profileRef?: string | null;
}
export interface SearchQuery {
  id: string;
  text: string;
  language: string;
  intent: "neutral" | "counter_evidence" | "practical";
  provider: string;
}
export interface SearchRun extends ResearchEnvelope {
  purpose: "exploration" | "follow_up" | "refresh" | "feedback";
  bucket: string;
  queries: SearchQuery[];
  status: "planned" | "running" | "complete" | "partial" | "deferred";
  cursorByQuery: Record<string, string | null>;
  counts: Record<string, number>;
  dueAt: string;
}
export interface SearchMatch extends ResearchEnvelope {
  queryId: string;
  canonicalUrl: string;
  provider: string;
  rank: number;
  retrievedAt: string;
  title: string;
  snippet: string;
  documentVersionId: string | null;
}
export interface DocumentVersion extends ResearchEnvelope {
  sourceId: string;
  canonicalUrl: string;
  originalUrl: string;
  contentHash: string;
  normalizedTextPath: string;
  title: string;
  authorNames: string[];
  originalLanguage: string;
  publishedAt: string | null;
  fetchedAt: string;
  contentType: string;
  accessLevel: "full_text" | "abstract" | "partial";
  extraction: "complete" | "partial" | "failed";
  rights: { retentionAllowed: boolean; attribution: string; expiresAt: string | null };
  doi: string | null;
  providerId: string | null;
  previousVersionId: string | null;
  integrity: "active" | "changed" | "retracted" | "unavailable";
  lastCheckedAt: string;
}
export interface TriageItem extends ResearchEnvelope {
  documentVersionId: string;
  kind: "audience_signal" | "expert_opinion" | "evidence_candidate" | "irrelevant";
  excerptLocator: TextLocator;
  redactedText: string;
  language: string;
  region: string | null;
  ageRange: AgeRange | null;
  question: string | null;
  classificationReason: string;
  status: "new" | "classified" | "linked" | "discarded";
  topicId: string | null;
}
export interface ResearchTopic extends ResearchEnvelope {
  question: string;
  bucket: string;
  ageRange: AgeRange | null;
  populationContext: string;
  exposure: string;
  comparison: string;
  outcome: string;
  triageItemIds: string[];
  status: "queued" | "researching" | "validated" | "deferred" | "rejected";
  priorityComponents: Record<string, number>;
  priorityScore: number;
  nextReviewAt: string;
  synthesisVersionId: string | null;
}
export interface Finding extends ResearchEnvelope {
  documentVersionId: string;
  locator: TextLocator;
  originalExcerpt: string;
  workingTranslation: string | null;
  language: string;
  studyDesign: string;
  population: string;
  exposure: string;
  comparison: string;
  outcome: string;
  result: string;
  effectSize: string | null;
  uncertainty: string | null;
  limitations: string;
  funding: string | null;
  causalSupport: boolean;
  overlapGroup: string | null;
}
export interface SynthesisVersion extends Revisioned {
  topicId: string;
  findingIds: string[];
  searchesRunIds: string[];
  excluded: { documentVersionId: string; reason: string }[];
  conflicts: {
    findingIds: string[];
    reason: string;
    resolution: "unresolved" | "wording_corrected" | "context_difference" | "qualified";
  }[];
  reconciliationPasses: 0 | 1;
  limitations: string;
  status: "draft" | "reviewed" | "superseded";
  reviewedAt: string | null;
}
export interface ClaimVersion extends Revisioned {
  topicId: string;
  synthesisVersionId: string;
  kind: "evidence" | "interpretation" | "hypothesis" | "business_opinion";
  wordingBn: string;
  allowedParaphraseRules: string[];
  forbiddenOverstatements: string[];
  findingIds: string[];
  parentClaimIds: string[];
  scope: { ages: AgeRange | null; region: string | null; context: string };
  certainty: Certainty;
  certaintyReasons: string[];
  status: ClaimStatus;
  reviewId: string | null;
  validUntil: string | null;
  lastCheckedAt: string | null;
  missionRelevance: string;
  attribution: string | null;
}
export interface EvidenceReview extends ResearchEnvelope {
  claimVersionIds: string[];
  operation: "evidence_review";
  producerTaskId: string;
  reviewerTaskId: string;
  reviewerIdentity: string;
  sourceChecks: {
    findingId: string;
    locatorVerified: boolean;
    supportsWording: boolean;
    limitationsPreserved: boolean;
  }[];
  decision: "approve" | "qualify" | "revise" | "defer" | "reject";
  findings: {
    code: string;
    severity: "low" | "medium" | "critical";
    location: string;
    reason: string;
    correction: string;
  }[];
  policyVersion: string;
  providerMetadata: Record<string, unknown>;
}
export interface ContentBrief extends ResearchEnvelope {
  topicId: string;
  synthesisVersionId: string;
  claimVersionIds: string[];
  kind: "text" | "image" | "video";
  angle: string;
  intendedTakeaway: string;
  action: { textBn: string; basis: "guidance" | "evidence" | "suggestion" };
  ageSegment: string;
  fingerprint: string;
  status: "draft" | "ready" | "used" | "held";
}
export interface ContentDependency extends ResearchEnvelope {
  claimVersionId: string;
  briefId: string;
  artifactId: string | null;
  postId: string | null;
}
export interface MemoryJob extends ResearchEnvelope {
  entityType: string;
  entityVersionId: string;
  dataset: string;
  operation: "upsert" | "remove";
  status: "pending" | "running" | "ready" | "failed";
  idempotencyKey: string;
  leaseOwner: string | null;
  leaseUntil: string | null;
  attempts: number;
  nextRunAt: string;
  remoteIds: string[];
  error: string | null;
}
export interface FeedbackItem extends ResearchEnvelope {
  platform: string;
  remoteItemId: string;
  postId: string;
  collectedAt: string;
  kind: "question" | "misunderstanding" | "activity_report" | "other";
  redactedText: string;
  metrics: Record<string, unknown> | null;
  topicId: string | null;
  triageItemId: string | null;
  observation: true;
}
export interface ResearchEvent extends ResearchEnvelope {
  entityType: string;
  entityId: string;
  fromState: string | null;
  toState: string;
  reason: string;
  actorTaskId: string;
  policyVersion: string;
}
export interface CorrectionCase extends ResearchEnvelope {
  claimVersionId: string;
  affectedPostIds: string[];
  severity: "low" | "medium" | "critical";
  reason: string;
  status: "open" | "contained" | "resolved";
  remoteActions: { postId: string; action: string; state: string; remoteId: string | null }[];
  notificationId: string | null;
}

export type SearchPlanDraft = {
  queries: Omit<SearchQuery, "id" | "provider">[];
  nextQuestions: string[];
};
export type ExtractionDraft = {
  items: Omit<TriageItem, keyof ResearchEnvelope | "documentVersionId" | "status" | "topicId">[];
  findings: Omit<Finding, keyof ResearchEnvelope | "documentVersionId">[];
};
export type SynthesisDraft = {
  claims: Omit<
    ClaimVersion,
    | keyof Revisioned
    | "topicId"
    | "synthesisVersionId"
    | "status"
    | "reviewId"
    | "validUntil"
    | "lastCheckedAt"
  >[];
  conflicts: SynthesisVersion["conflicts"];
  limitations: string;
  decision: "ready" | "defer" | "reject";
};
export type EvidenceReviewDraft = Omit<
  EvidenceReview,
  keyof ResearchEnvelope | "claimVersionIds" | "operation" | "producerTaskId" | "reviewerTaskId"
>;
export type BriefDraft = Omit<
  ContentBrief,
  keyof ResearchEnvelope | "topicId" | "synthesisVersionId" | "claimVersionIds" | "status"
>;
