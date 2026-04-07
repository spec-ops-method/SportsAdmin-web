import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PointScales from '../../src/pages/PointScales';
import { AuthProvider } from '../../src/context/AuthContext';
import type { CarnivalSummary, PointScale } from '@sportsadmin/shared';

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
  name: 'Test Carnival',
  competitorCount: 0,
  eventCount: 0,
  houseCount: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockScales: PointScale[] = [
  {
    carnivalId: 1,
    name: 'Standard',
    entries: [
      { place: 1, points: 10 },
      { place: 2, points: 8 },
      { place: 3, points: 6 },
    ],
    usedByHeatCount: 2,
  },
  {
    carnivalId: 1,
    name: 'Mini',
    entries: [{ place: 1, points: 5 }],
    usedByHeatCount: 0,
  },
];

function pendingFetch() {
  return new Promise<never>(() => {});
}

function fetchScalesSuccess() {
  return Promise.resolve({
    ok: true,
    json: async () => mockScales,
  });
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderPointScales() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <PointScales />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PointScales', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
  });

  it('shows notice when no active carnival is selected', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: null, setActiveCarnival: vi.fn() });
    renderPointScales();
    expect(screen.getByText(/select an active carnival/i)).toBeInTheDocument();
  });

  it('shows loading state while data is being fetched', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(pendingFetch);
    renderPointScales();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders point scale list when data loads', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(fetchScalesSuccess);
    renderPointScales();
    await waitFor(() => {
      expect(screen.getByText(/Standard/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Mini/)).toBeInTheDocument();
    expect(screen.getByText(/Used by 2 heats/)).toBeInTheDocument();
    expect(screen.getByText(/Used by 0 heats/)).toBeInTheDocument();
  });

  it('shows validation error when create name is empty', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(fetchScalesSuccess);
    renderPointScales();

    // Open the create form
    const newScaleBtn = screen.getByText(/\+ New Scale/i);
    fireEvent.click(newScaleBtn);

    // Submit without a name
    const createBtn = screen.getByRole('button', { name: /^Create$/i });
    fireEvent.click(createBtn);

    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it('shows recalculate confirmation dialog when button is clicked', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(fetchScalesSuccess);
    renderPointScales();

    await waitFor(() => {
      expect(screen.getByText(/↺ Recalculate All Points/i)).toBeInTheDocument();
    });

    const recalcBtn = screen.getByText(/↺ Recalculate All Points/i);
    fireEvent.click(recalcBtn);

    expect(screen.getByText(/Recalculate points for all competitors/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Confirm$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancel$/i })).toBeInTheDocument();
  });
});
