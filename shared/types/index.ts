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

// ─── Event Types ─────────────────────────────────────────────────────────────

export interface EventType {
  id: number;
  carnivalId: number;
  description: string;
  units: string;
  unitsDisplay: string;
  laneCount: number;
  include: boolean;
  entrantCount: number;
  divisionCount: number;
  heatCount: number;
}

export interface EventDivision {
  id: number;
  eventTypeId: number;
  sex: string;
  age: string;
  include: boolean;
  record: string | null;
  numericRecord: number | null;
  recordName: string | null;
  heatCount: number;
}

export interface FinalLevel {
  eventTypeId: number;
  finalLevel: number;
  label: string;
  numHeats: number;
  pointScale: string | null;
  promotionType: 'NONE' | 'Smooth' | 'Staggered';
  useTimes: boolean;
  promoteCount: number;
  effectsRecords: boolean;
}

export interface EventTypeDetail extends EventType {
  divisions: EventDivision[];
  finalLevels: FinalLevel[];
}

export interface Heat {
  id: number;
  eventId: number;
  heatNumber: number;
  finalLevel: number;
  finalLevelLabel: string;
  pointScale: string | null;
  completed: boolean;
  status: 'future' | 'active' | 'completed' | 'promoted';
  eventNumber: number | null;
  eventTime: string | null;
  competitorCount: number;
}

export interface HeatDetailResponse {
  id: number;
  eventId: number;
  heatNumber: number;
  finalLevel: number;
  finalLevelLabel: string;
  pointScale: string | null;
  completed: boolean;
  status: 'future' | 'active' | 'completed' | 'promoted';
  eventNumber: number | null;
  eventTime: string | null;
  competitorCount: number;
  eventTypeId: number;
  eventTypeDescription: string;
  sex: string;
  age: string;
  units: string;
  laneCount: number;
  carnivalId: number;
}

export interface CompEvent {
  id: number;
  competitorId: number;
  competitorFullName: string;
  houseCode: string;
  eventId: number;
  heatId: number;
  heatNumber: number;
  finalLevel: number;
  lane: number | null;
  place: number;
  result: string | null;
  numericResult: number;
  points: number;
  memo: string | null;
}

export interface EventOrderItem {
  heatId: number;
  eventNumber: number | null;
  eventTime: string | null;
  eventTypeDescription: string;
  sex: string;
  age: string;
  finalLevel: number;
  finalLevelLabel: string;
  heatNumber: number;
  status: string;
  completed: boolean;
}

export interface LanePromotion {
  place: number;
  lane: number;
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

// ─── Events & Heats ──────────────────────────────────────────────────────────

export interface EventType {
  id: number;
  carnivalId: number;
  description: string;
  units: string;
  unitsDisplay: string;
  laneCount: number;
  reportTypeId: number | null;
  include: boolean;
  entrantCount: number;
  placesAcrossAllHeats: boolean;
  meetManagerEvent: string | null;
  divisionCount: number;
  heatCount: number;
}

export interface EventTypeDetail extends EventType {
  divisions: EventDivision[];
  finalLevels: FinalLevel[];
}

export interface EventDivision {
  id: number;
  eventTypeId: number;
  sex: string;
  age: string;
  include: boolean;
  record: string | null;
  numericRecord: number | null;
  recordName: string | null;
  recordHouseId: number | null;
  recordHouseCode: string | null;
  heatCount: number;
}

export interface FinalLevel {
  eventTypeId: number;
  finalLevel: number;
  label: string;
  numHeats: number;
  pointScale: string | null;
  promotionType: 'NONE' | 'Smooth' | 'Staggered';
  useTimes: boolean;
  promoteCount: number;
  effectsRecords: boolean;
}

export interface Heat {
  id: number;
  eventId: number;
  heatNumber: number;
  finalLevel: number;
  finalLevelLabel: string;
  pointScale: string | null;
  promotionType: string;
  useTimes: boolean;
  effectsRecords: boolean;
  completed: boolean;
  status: 'future' | 'active' | 'completed' | 'promoted';
  eventNumber: number | null;
  eventTime: string | null;
  competitorCount: number;
}

export interface CompEvent {
  id: number;
  competitorId: number;
  competitorFullName: string;
  houseCode: string;
  eventId: number;
  heatId: number;
  heatNumber: number;
  finalLevel: number;
  lane: number | null;
  place: number;
  result: string | null;
  numericResult: number;
  points: number;
  memo: string | null;
}

export interface EventOrderItem {
  heatId: number;
  eventNumber: number | null;
  eventTime: string | null;
  eventTypeDescription: string;
  sex: string;
  age: string;
  finalLevel: number;
  finalLevelLabel: string;
  heatNumber: number;
  status: string;
  completed: boolean;
}

export interface GenerateHeatsResponse {
  heatsCreated: number;
  eventsProcessed: number;
  existingHeatsCleared: boolean;
}

export interface PromoteResponse {
  promotedCount: number;
  fromLevel: number;
  fromLevelLabel: string;
  toLevel: number;
  toLevelLabel: string;
  heatsPromoted: Array<{ heatNumber: number; competitorsPromoted: string[] }>;
}

export interface AutoEnterResponse {
  eventsProcessed: number;
  competitorsEntered: number;
  breakdown: Array<{ event: string; competitorsAdded: number; heatsUsed: number }>;
}
