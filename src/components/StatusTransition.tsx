import { useState, useEffect } from 'react';
import { fetchTransitions, transitionIssue, type Transition } from '../api';
import StatusBadge from './StatusBadge';

interface StatusTransitionProps {
  issueKey: string;
  currentStatus: string;
  colorName: string;
  onTransitioned: () => void;
}

export default function StatusTransition({ issueKey, currentStatus, colorName, onTransitioned }: StatusTransitionProps) {
  const [open, setOpen] = useState(false);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchTransitions(issueKey).then(setTransitions).finally(() => setLoading(false));
    }
  }, [open, issueKey]);

  const handleTransition = async (t: Transition) => {
    setSaving(true);
    try {
      await transitionIssue(issueKey, t.id);
      onTransitioned();
      setOpen(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="hover:opacity-80">
        <StatusBadge name={currentStatus} colorName={colorName} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px] left-0">
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
            ) : (
              transitions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTransition(t)}
                  disabled={saving}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {t.name} → {t.to.name}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
