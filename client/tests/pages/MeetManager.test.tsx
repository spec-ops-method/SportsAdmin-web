import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MeetManager from '../../src/pages/MeetManager';
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

function pendingFetch() {
  return new Promise<never>(() => {});
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderMeetManager() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <MeetManager />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MeetManager', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
  });

  it('shows message when no carnival is selected', () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: null, setActiveCarnival: vi.fn() });
    renderMeetManager();
    expect(screen.getByText(/no active carnival selected/i)).toBeInTheDocument();
  });

  it('renders Division Mapping tab by default', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(pendingFetch);
    renderMeetManager();
    expect(screen.getByRole('tab', { name: /division mapping/i })).toBeInTheDocument();
    // Division Mapping tab should be active (aria-selected)
    const divTab = screen.getByRole('tab', { name: /division mapping/i });
    expect(divTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders Export tab with three download buttons', async () => {
    mockUseCarnival.mockReturnValue({ activeCarnival: mockCarnival, setActiveCarnival: vi.fn() });
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => [] }),
    );
    renderMeetManager();

    await waitFor(() => {
      const exportTab = screen.getByRole('tab', { name: /export/i });
      exportTab.click();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export entries/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export athletes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export re1/i })).toBeInTheDocument();
    });
  });
});
