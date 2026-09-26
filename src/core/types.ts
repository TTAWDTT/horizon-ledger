export type DecisionStatus = 'draft' | 'proposed' | 'decided' | 'rejected' | 'superseded';
export type EvidenceType = 'commit' | 'file' | 'link' | 'doc' | 'test' | 'experiment' | 'meeting' | 'session' | 'benchmark';
export type EvidenceStrength = 'strong' | 'moderate' | 'weak';
export type AlternativeVerdict = 'accepted' | 'rejected' | 'deferred' | 'unknown';
export type DecisionRelation = 'supersedes' | 'depends_on' | 'related_to';

export interface Evidence {
  id: string;
  type: EvidenceType;
  value: string;
  title?: string;
  source?: string;
  strength?: EvidenceStrength;
  note?: string;
  createdAt?: string;
  hash?: string;
}

export interface Alternative {
  id: string;
  name: string;
  verdict?: AlternativeVerdict;
  reason?: string;
  evidenceIds?: string[];
}

export interface DecisionPolicy {
  mode?: 'observe' | 'review' | 'block';
  requireEvidence?: 'any' | 'verified' | 'strong' | 'sealed' | 'attributed';
}

export interface DecisionLink {
  id: string;
  type: DecisionRelation;
  note?: string;
}

export interface Decision {
  id: string;
  title: string;
  status: DecisionStatus;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  context?: string;
  decision?: string;
  consequences?: string;
  confidence?: 'low' | 'medium' | 'high';
  horizon?: 'short' | 'medium' | 'long';
  kind?: 'engineering' | 'product' | 'research' | 'process' | 'other';
  scope?: string[];
  tags?: string[];
  owner?: string;
  alternatives?: Alternative[];
  policy?: DecisionPolicy;
  evidence?: Evidence[];
  links?: DecisionLink[];
  body?: string;
}

