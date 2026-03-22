import { useState, useEffect } from 'react';
import { searchUsers, fetchTeams, saveTeams, type TeamConfig, type TeamMember } from '../api';

interface SettingsPanelProps {
  onClose: () => void;
  onTeamsChanged: (teams: TeamConfig[]) => void;
}

export default function SettingsPanel({ onClose, onTeamsChanged }: SettingsPanelProps) {
  const [teams, setTeams] = useState<TeamConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTeamIdx, setEditingTeamIdx] = useState<number | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [saving, setSaving] = useState(false);

  // User search
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<{ accountId: string; displayName: string; avatarUrls?: Record<string, string> }[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchTeams().then((t) => { setTeams(t); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const persist = async (updated: TeamConfig[]) => {
    setTeams(updated);
    setSaving(true);
    try {
      await saveTeams(updated);
      onTeamsChanged(updated);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleAddTeam = () => {
    const name = newTeamName.trim();
    if (!name) return;
    const updated = [...teams, { name, members: [] }];
    persist(updated);
    setNewTeamName('');
    setEditingTeamIdx(updated.length - 1);
  };

  const handleDeleteTeam = (idx: number) => {
    const updated = teams.filter((_, i) => i !== idx);
    persist(updated);
    if (editingTeamIdx === idx) setEditingTeamIdx(null);
  };

  const handleRenameTeam = (idx: number, name: string) => {
    const updated = [...teams];
    updated[idx] = { ...updated[idx], name };
    persist(updated);
  };

  const handleSearchUsers = async (query: string) => {
    setUserQuery(query);
    if (query.length < 2) { setUserResults([]); return; }
    setSearching(true);
    try {
      const results = await searchUsers(query);
      setUserResults(results);
    } catch {
      setUserResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAddMember = (teamIdx: number, user: { accountId: string; displayName: string; avatarUrls?: Record<string, string> }) => {
    const updated = [...teams];
    const team = { ...updated[teamIdx] };
    if (team.members.some((m) => m.accountId === user.accountId)) return;
    const member: TeamMember = { accountId: user.accountId, displayName: user.displayName };
    if (user.avatarUrls?.['32x32']) member.avatarUrl = user.avatarUrls['32x32'];
    team.members = [...team.members, member];
    updated[teamIdx] = team;
    persist(updated);
    setUserQuery('');
    setUserResults([]);
  };

  const handleRemoveMember = (teamIdx: number, accountId: string) => {
    const updated = [...teams];
    const team = { ...updated[teamIdx] };
    team.members = team.members.filter((m) => m.accountId !== accountId);
    updated[teamIdx] = team;
    persist(updated);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" onClick={onClose}>
        <div
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-800 flex flex-col max-h-[calc(100vh-4rem)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Settings</h2>
              {saving && <span className="text-xs text-blue-500 animate-pulse">Saving...</span>}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {loading ? (
              <div className="py-8 text-center text-gray-400">
                <div className="animate-spin inline-block w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full mb-2" />
                <p className="text-sm">Loading teams...</p>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Custom Teams</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Create teams to quickly filter issues by group. Shared across all dashboard users.
                </p>

                {/* Existing teams */}
                <div className="space-y-3">
                  {teams.map((team, idx) => (
                    <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        {editingTeamIdx === idx ? (
                          <input
                            type="text"
                            value={team.name}
                            onChange={(e) => handleRenameTeam(idx, e.target.value)}
                            className="text-sm font-medium border border-blue-400 rounded px-2 py-1 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{team.name}</span>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingTeamIdx(editingTeamIdx === idx ? null : idx)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {editingTeamIdx === idx ? 'Done' : 'Edit'}
                          </button>
                          <button
                            onClick={() => handleDeleteTeam(idx)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Members */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {team.members.length === 0 && (
                          <span className="text-xs text-gray-400 italic">No members added</span>
                        )}
                        {team.members.map((m) => (
                          <span key={m.accountId} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full">
                            {m.displayName}
                            {editingTeamIdx === idx && (
                              <button
                                onClick={() => handleRemoveMember(idx, m.accountId)}
                                className="text-gray-400 hover:text-red-500 ml-0.5"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </span>
                        ))}
                      </div>

                      {/* Add member search (only when editing) */}
                      {editingTeamIdx === idx && (
                        <div className="relative">
                          <input
                            type="text"
                            value={userQuery}
                            onChange={(e) => handleSearchUsers(e.target.value)}
                            placeholder="Search users to add..."
                            className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2.5 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {searching && <div className="text-xs text-gray-400 animate-pulse mt-1">Searching...</div>}
                          {userResults.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                              {userResults
                                .filter((u) => !team.members.some((m) => m.accountId === u.accountId))
                                .map((u) => (
                                  <button
                                    key={u.accountId}
                                    onClick={() => handleAddMember(idx, u)}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    {u.displayName}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add new team */}
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddTeam(); }}
                    placeholder="New team name..."
                    className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddTeam}
                    disabled={!newTeamName.trim()}
                    className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
