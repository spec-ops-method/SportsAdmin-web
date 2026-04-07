import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventTypes from '../../src/pages/EventTypes';
import { AuthProvider } from '../../src/context/AuthContext';
import type { CarnivalSummary } from '@sportsadmin/shared';

// ─── Mock CarnivalContext ─────────────────────────────────────────────────────

vi.mock('../../src/context/CarnivalContext', () => ({
  useCarnival: vi.fn(),
}));

import { useCarnival } from '../../src/context/CarnivalContext';
const mockUseCarnival = vi.mocked(useCarnival);

// ─── Mock useNavigate ─────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCarnival: CarnivalSummary = {
  id: 1,
  name: 'Summer Carnival',
  competitorCount: 0,
  eventCount: 0,
  houseCount: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockEventTypes = [
  {
    id: 1,
    carnivalId: 1,
    description: '100m Sprint',
    units: 'Seconds',
    unitsDisplay: 'Seconds',
    laneCount: 8,
    include: true,
    entrantCount: 1,
    divisionCount: 3,
    heatCount: 6,
  },
  {
    id: 2,
    carnivalId: 1,
    description: 'Long Jump',
    units: 'Meters',
    unitsDisplay: 'Meters',
    laneCount: 0,
    include: false,
    entrantCount: 1,
    divisionCount: 2,
    heatCount: 4,
  },
];

function pendingFetch() {
  return new Promise<never>(() => {});
}

function fetchSuccess() {
  return Promise.resolve({
    ok: true,
    json: async () => mockEventTypes,
  });
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderEventTypes() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <EventTypes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EventTypes', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockNavigate.mockReset();
    localStorage.clear();
  });

  it('shows notice when no active carnival is selected', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: null, setActiveCarnival: vi.fn() });
    renderEventTypes();
    expect(screen.getByText(/select an active carnival/i)).toBeInTheDocument();
  });

  it('shows loading state while data is being fetched', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(pendingFetch);
    renderEventTypes();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders the event types list when data loads', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(fetchSuccess);
    renderEventTypes();
    await waitFor(() => {
      expect(screen.getByText('100m Sprint')).toBeInTheDocument();
    });
    expect(screen.getByText('Long Jump')).toBeInTheDocument();
  });

  it('"Manage" button navigates to /event-types/:id', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(fetchSuccess);
    renderEventTypes();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /manage/i })).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /manage/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/event-types/1');
  });

  it('shows a validation error when description is empty on submit', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(pendingFetch);
    renderEventTypes();

    fireEvent.click(screen.getByRole('button', { name: /\+ new event type/i }));

    // Submit without filling description
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByText(/description is required/i)).toBeInTheDocument();
    });
  });
});
