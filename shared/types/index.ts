// Core domain types shared between API and client

// ─── Auth & Users ────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'coordinator' | 'operator' | 'viewer';

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthPayload {
  userId: number;
  email: string;
  role: UserRole;
}

// ─── Carnivals ────────────────────────────────────────────────────────────────

export interface Carnival {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CarnivalSummary extends Carnival {
  competitorCount: number;
  eventCount: number;
  houseCount: number;
}

export interface CarnivalDetail extends Carnival {
  settings: CarnivalSettings;
  summary: {
    competitorCount: number;
    houseCount: number;
    eventTypeCount: number;
    eventCount: number;
    heatsCompleted: number;
    heatsTotal: number;
  };
}

export interface CarnivalSettings {
  carnivalId: number;
  title: string;
  footer: string | null;
  openAge: number;
  houseTypeId: number | null;
  alertToRecord: boolean;
  reportHead1: string;
  reportHead2: string;
  meetManagerTeam: string | null;
  meetManagerCode: string | null;
  meetManagerTop: number;
  htmlExportEnabled: boolean;
  htmlReportHeader: string | null;
  publicAccess: boolean;
  ageCutoffMonth: number;
  ageCutoffDay: number;
}

// ─── Houses ───────────────────────────────────────────────────────────────────

export interface House {
  id: number;
  carnivalId: number;
  code: string;
  name: string;
  houseTypeId: number | null;
  include: boolean;
  details: string | null;
  lane: number | null;
  competitionPool: number | null;
  totalPoints: number;
  extraPoints: number;
}

export interface HousePointsExtra {
  id: number;
  houseId: number;
  points: number;
  reason: string | null;
}

// ─── Reference / Lookup ───────────────────────────────────────────────────────

export type Sex = 'male' | 'female' | 'mixed';
export type FinalStatus = 'future' | 'active' | 'completed' | 'promoted';
export type PromotionType = 'none' | 'smooth' | 'staggered';

export interface Unit {
  id: number;
  name: string;
  label: string;
  sortAscending: boolean;
}

export interface HouseType {
  id: number;
  name: string;
}

// ─── Competitors ──────────────────────────────────────────────────────────────

export interface Competitor {
  id: number;
  carnivalId: number;
  givenName: string;
  surname: string;
  fullName: string;
  sex: 'M' | 'F';
  age: number;
  dob: string | null;
  houseId: number;
  houseCode: string;
  houseName: string;
  include: boolean;
  totalPoints: number;
  externalId: string | null;
  comments: string | null;
  eventCount: number;
}

export interface CompetitorDetail extends Competitor {
  events: CompetitorEventEntry[];
}

export interface CompetitorEventEntry {
  compEventId: number;
  eventTypeDescription: string;
  finalLevel: number;
  heat: number;
  lane: number | null;
  place: number | null;
  result: string | null;
  points: number;
  memo: string | null;
}

export interface CompetitorEventAge {
  carnivalId: number;
  competitorAge: number;
  eventAge: string;
  flag: boolean;
  tag: boolean;
  meetManagerDiv: string | null;
}

export interface CompetitorListResponse {
  data: Competitor[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
  };
}

export interface ImportPreviewRow {
  rowNumber: number;
  status: 'valid' | 'warning' | 'skip' | 'error';
  data: {
    givenName?: string;
    surname?: string;
    sex?: string;
    age?: number;
    dob?: string;
    houseCode?: string;
    externalId?: string;
  };
  message: string | null;
}

export interface ImportPreviewResponse {
  totalRows: number;
  valid: number;
  warnings: number;
  skipped: number;
  errors: number;
  previewToken: string;
  rows: ImportPreviewRow[];
}

export interface ImportCommitResponse {
  imported: number;
  housesCreated: number;
  skippedDuplicates: number;
  errors: number;
}

// ─── API responses ────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Competitors ──────────────────────────────────────────────────────────────

export interface Competitor {
  id: number;
  carnivalId: number;
  givenName: string;
  surname: string;
  fullName: string;
  sex: 'M' | 'F';
  age: number;
  dob: string | null;
  houseId: number;
  houseCode: string;
  houseName: string;
  include: boolean;
  totalPoints: number;
  externalId: string | null;
  comments: string | null;
  eventCount: number;
}

export interface CompetitorEventEntry {
  compEventId: number;
  eventTypeDescription: string;
  finalLevel: number;
  heat: number;
  lane: number | null;
  place: number | null;
  result: string | null;
  points: number;
  memo: string | null;
}

export interface CompetitorDetail extends Competitor {
  events: CompetitorEventEntry[];
}

export interface CompetitorListResponse {
  data: Competitor[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
  };
}

export interface ImportPreviewRow {
  rowNumber: number;
  status: 'valid' | 'warning' | 'skip' | 'error';
  data: {
    givenName?: string;
    surname?: string;
    sex?: string;
    age?: number;
    dob?: string;
    houseCode?: string;
    externalId?: string;
  };
  message: string | null;
}

export interface ImportPreviewResponse {
  totalRows: number;
  valid: number;
  warnings: number;
  skipped: number;
  errors: number;
  previewToken: string;
  rows: ImportPreviewRow[];
}

export interface ImportCommitResponse {
  imported: number;
  housesCreated: number;
  skippedDuplicates: number;
  errors: number;
}
