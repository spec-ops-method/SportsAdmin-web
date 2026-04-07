import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Competitors from '../../src/pages/Competitors';
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
  competitorCount: 0,
  eventCount: 0,
  houseCount: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockCompetitor = {
  id: 1,
  carnivalId: 1,
  givenName: 'Alice',
  surname: 'Smith',
  fullName: 'Alice Smith',
  sex: 'F',
  age: 12,
  dob: null,
  houseId: 1,
  houseCode: 'RED',
  houseName: 'Red House',
  include: true,
  totalPoints: 15,
  externalId: null,
  comments: null,
  eventCount: 2,
};

function pendingFetch() {
  return new Promise<never>(() => {});
}

function fetchSuccess(url: string) {
  if (String(url).includes('/houses')) {
    return Promise.resolve({
      ok: true,
      json: async () => [{ id: 1, carnivalId: 1, code: 'RED', name: 'Red House', totalPoints: 0 }],
    });
  }
  // competitors list
  return Promise.resolve({
    ok: true,
    json: async () => ({
      data: [mockCompetitor],
      pagination: { page: 1, perPage: 25, total: 1 },
    }),
  });
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderCompetitors() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Competitors />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Competitors', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows notice when no active carnival is selected', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: null, setActiveCarnival: vi.fn() });
    renderCompetitors();
    expect(screen.getByText(/select an active carnival/i)).toBeInTheDocument();
  });

  it('shows loading state while data is being fetched', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(pendingFetch);
    renderCompetitors();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders the competitor list when data loads', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(fetchSuccess);
    renderCompetitors();
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });
    expect(screen.getByText('RED')).toBeInTheDocument();
  });

  it('calls the API with a search param when the user types in the search box', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(fetchSuccess);
    renderCompetitors();

    // Wait for initial render to settle
    await waitFor(() => expect(screen.getByPlaceholderText(/search by name/i)).toBeInTheDocument());

    vi.useFakeTimers();

    const searchInput = screen.getByPlaceholderText(/search by name/i);
    fireEvent.change(searchInput, { target: { value: 'alice' } });

    // Advance past the 350 ms debounce inside act so React flushes effects
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    vi.useRealTimers();

    await waitFor(() => {
      const calls = mockFetch.mock.calls.map(([url]) => String(url));
      const searchCall = calls.find((u) => u.includes('search=alice'));
      expect(searchCall).toBeDefined();
    });
  });

  it('shows a validation error when given name is empty on submit', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(pendingFetch);
    renderCompetitors();

    fireEvent.click(screen.getByRole('button', { name: /\+ add competitor/i }));

    // Submit without filling in given name
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByText(/given name is required/i)).toBeInTheDocument();
    });
  });
});
