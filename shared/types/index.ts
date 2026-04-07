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

export interface CarnivalSettings {
  carnivalId: number;
  title: string;
  footer: string | null;
  openAge: number;
  houseTypeId: number | null;
  meetManagerTeam: string | null;
  meetManagerCode: string | null;
  meetManagerTop: number | null;
  publicAccess: boolean;
}

// ─── Houses ───────────────────────────────────────────────────────────────────

export interface House {
  id: number;
  carnivalId: number;
  code: string;
  name: string;
  competitionPool: number | null;
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
