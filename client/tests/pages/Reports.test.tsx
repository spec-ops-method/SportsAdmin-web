import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Reports from '../../src/pages/Reports';
import { AuthProvider } from '../../src/context/AuthContext';
import type { CarnivalSummary } from '@sportsadmin/shared';

// ─── Mock CarnivalContext ─────────────────────────────────────────────────────

vi.mock('../../src/context/CarnivalContext', () => ({
  useCarnival: vi.fn(),
}));

import { useCarnival } from '../../src/context/CarnivalContext';
const mockUseCarnival = vi.mocked(useCarnival);

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCarnival: CarnivalSummary = {
  id: 1,
  name: 'Summer Carnival',
  competitorCount: 5,
  eventCount: 3,
  houseCount: 2,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockHousePoints = [
  {
    houseCode: 'RED',
    houseName: 'Red House',
    eventPoints: 120,
    extraPoints: 10,
    grandTotal: 130,
    percentage: 55.3,
  },
  {
    houseCode: 'BLU',
    houseName: 'Blue House',
    eventPoints: 95,
    extraPoints: 10,
    grandTotal: 105,
    percentage: 44.7,
  },
];

function pendingFetch() {
  return new Promise<never>(() => {});
}

function fetchSuccessForUrl(url: string) {
  if (String(url).includes('house-points')) {
    return Promise.resolve({
      ok: true,
      json: async () => mockHousePoints,
    });
  }
  if (String(url).includes('cumulative-by-event-number')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ eventNumbers: [], series: [] }),
    });
  }
  return Promise.resolve({ ok: true, json: async () => [] });
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderReports() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Reports />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Reports', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
  });

  it('shows notice when no active carnival is selected', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: null, setActiveCarnival: vi.fn() });
    renderReports();
    expect(screen.getByText(/select an active carnival/i)).toBeInTheDocument();
  });

  it('shows loading state while house points are being fetched', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(pendingFetch);
    renderReports();
    expect(screen.getByText(/loading house points/i)).toBeInTheDocument();
  });

  it('renders house points table with correct data', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(fetchSuccessForUrl);
    renderReports();

    await waitFor(() => {
      expect(screen.getByText('Red House')).toBeInTheDocument();
    });

    expect(screen.getByText('RED')).toBeInTheDocument();
    expect(screen.getByText('Blue House')).toBeInTheDocument();
  });

  it('renders the print button', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(pendingFetch);
    renderReports();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('renders the report category sidebar', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(pendingFetch);
    renderReports();
    expect(screen.getByLabelText(/report categories/i)).toBeInTheDocument();
    // Each category label appears in the sidebar nav
    expect(screen.getAllByText('House Points').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Programme')).toBeInTheDocument();
    expect(screen.getByText('Marshalling Lists')).toBeInTheDocument();
    expect(screen.getByText(/Champions/i)).toBeInTheDocument();
  });
});
