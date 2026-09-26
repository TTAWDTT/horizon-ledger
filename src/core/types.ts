export type DecisionStatus = 'draft' | 'proposed' | 'decided' | 'rejected' | 'superseded';
export type EvidenceType = 'commit' | 'file' | 'link' | 'doc' | 'test' | 'experiment' | 'meeting' | 'session' | 'benchmark';
export type EvidenceStrength = 'strong' | 'moderate' | 'weak';
export type AlternativeVerdict = 'accepted' | 'rejected' | 'deferred' | 'unknown';

export interface Evidence {
  id: string;
  type: EvidenceType;
  value: string;
  title?: string;
  source?: string;
  strength?: EvidenceStrength;
  note?: string;
  createdAt?: string;
}

export interface Alternative {
  id: string;
  name: string;
  verdict?: AlternativeVerdict;
  reason?: string;
  evidenceIds?: string[];
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
  evidence?: Evidence[];
  links?: string[];
  body?: string;
}
