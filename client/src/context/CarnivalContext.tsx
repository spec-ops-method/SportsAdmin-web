import { createContext, useContext, useState, ReactNode } from 'react';
import { CarnivalSummary } from '@sportsadmin/shared';

interface CarnivalContextValue {
  activeCarnival: CarnivalSummary | null;
  setActiveCarnival: (c: CarnivalSummary | null) => void;
}

const CarnivalContext = createContext<CarnivalContextValue | null>(null);

const STORAGE_KEY = 'sa_active_carnival_id';

export function CarnivalProvider({ children }: { children: ReactNode }) {
  const [activeCarnival, setActiveCarnivalState] = useState<CarnivalSummary | null>(null);

  function setActiveCarnival(c: CarnivalSummary | null) {
    setActiveCarnivalState(c);
    if (c) {
      localStorage.setItem(STORAGE_KEY, String(c.id));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return (
    <CarnivalContext.Provider value={{ activeCarnival, setActiveCarnival }}>
      {children}
    </CarnivalContext.Provider>
  );
}

export function useCarnival(): CarnivalContextValue {
  const ctx = useContext(CarnivalContext);
  if (!ctx) throw new Error('useCarnival must be used inside <CarnivalProvider>');
  return ctx;
}

export function storedCarnivalId(): number | null {
  const val = localStorage.getItem(STORAGE_KEY);
  return val ? parseInt(val, 10) : null;
}
